/**
 * Socket.IO wiring. This module owns the realtime protocol:
 *  - room lifecycle (create / join / leave / disconnect)
 *  - host-authoritative media control (load / play / pause / seek)
 *  - scheduled execution via `executeAt` so all devices act together
 *  - clock-offset handshake so `executeAt` is meaningful across devices
 *
 * IMPORTANT: the server never trusts a client's claim to be host. Every
 * media:* handler re-checks ownership against the store.
 */

import type { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  MediaAction,
  ServerToClientEvents,
  SocketData,
} from "../lib/room-types";
import { expectedPosition, roomStore } from "./room-manager";

// How far in the future scheduled actions fire. Big enough to cover network
// jitter to the slowest phone, small enough to feel responsive.
const SCHEDULE_DELAY_MS = 700;

type IOServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Basic sanitizers — never trust client strings. */
function cleanRoomId(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 6);
}
function cleanName(raw: unknown): string {
  return String(raw ?? "").replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 24);
}
function cleanVideoId(raw: unknown): string {
  // YouTube IDs are 11 chars of [A-Za-z0-9_-].
  return String(raw ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
}

export function initSocketServer(httpServer: HTTPServer): IOServer {
  const io: IOServer = new Server(httpServer, {
    // Same-origin in this setup; widen if you split the socket server out.
    cors: { origin: true, credentials: true },
  });

  io.on("connection", (socket) => {
    // ----- Clock offset handshake -------------------------------------------
    socket.on("time:sync", ({ clientSent }) => {
      socket.emit("time:sync", { clientSent, serverTime: Date.now() });
    });

    // ----- Room lifecycle ---------------------------------------------------
    socket.on("room:create", ({ name }, ack) => {
      const room = roomStore.createRoom(socket.id, cleanName(name));
      socket.data.roomId = room.roomId;
      socket.join(room.roomId);
      ack({ ok: true, roomId: room.roomId, state: room, selfSocketId: socket.id });
    });

    socket.on("room:join", ({ roomId, name }, ack) => {
      const id = cleanRoomId(roomId);
      if (id.length !== 6) {
        return ack({ ok: false, code: "INVALID_CODE", message: "Enter a 6-digit code." });
      }
      const room = roomStore.getRoom(id);
      if (!room) {
        return ack({ ok: false, code: "ROOM_NOT_FOUND", message: "That room doesn't exist." });
      }
      const added = roomStore.addUser(id, {
        socketId: socket.id,
        name: cleanName(name),
        isHost: false,
        joinedAt: Date.now(),
      });
      if (!added) {
        return ack({ ok: false, code: "INTERNAL", message: "Could not join the room." });
      }
      socket.data.roomId = id;
      socket.join(id);

      // Tell existing members someone arrived (and refresh their roster).
      const self = added.users.find((u) => u.socketId === socket.id)!;
      socket.to(id).emit("user:joined", self);
      socket.to(id).emit("room:state", added);

      // Send the joiner the authoritative state (with a *fresh* extrapolated
      // position) so they can catch up to an in-progress video.
      const catchUp = {
        ...added,
        position: expectedPosition(added, Date.now()),
        updatedAt: Date.now(),
      };
      ack({ ok: true, roomId: id, state: catchUp, selfSocketId: socket.id });
    });

    socket.on("room:leave", () => handleLeave(io, socket));
    socket.on("disconnect", () => handleLeave(io, socket));

    // ----- Host-authoritative media control ---------------------------------

    socket.on("media:load", (payload) => {
      const roomId = socket.data.roomId;
      if (!roomId || !roomStore.isHost(roomId, socket.id)) return;
      const videoId = cleanVideoId(payload.videoId);
      if (!videoId) return;

      const room = roomStore.setMedia(roomId, {
        videoId,
        videoTitle: payload.videoTitle,
        thumbnail: payload.thumbnail,
      });
      if (!room) return;

      broadcastScheduled(io, roomId, "LOAD", videoId, 0);
      io.to(roomId).emit("room:state", room);
    });

    socket.on("media:play", ({ position }) => {
      withHost(socket, (roomId, room) => {
        const executeAt = Date.now() + SCHEDULE_DELAY_MS;
        // Playback "starts" at executeAt, so the room clock anchors there.
        roomStore.setPlayback(roomId, {
          isPlaying: true,
          position: safePos(position),
          updatedAt: executeAt,
        });
        broadcastScheduled(io, roomId, "PLAY", room.videoId, safePos(position), executeAt);
      });
    });

    socket.on("media:pause", ({ position }) => {
      withHost(socket, (roomId, room) => {
        // Pause immediately; everyone freezes at the host's reported position.
        roomStore.setPlayback(roomId, {
          isPlaying: false,
          position: safePos(position),
          updatedAt: Date.now(),
        });
        broadcastScheduled(io, roomId, "PAUSE", room.videoId, safePos(position));
      });
    });

    socket.on("media:seek", ({ position }) => {
      withHost(socket, (roomId, room) => {
        const current = roomStore.getRoom(roomId);
        const executeAt = Date.now() + SCHEDULE_DELAY_MS;
        roomStore.setPlayback(roomId, {
          isPlaying: current?.isPlaying ?? false,
          position: safePos(position),
          updatedAt: executeAt,
        });
        broadcastScheduled(io, roomId, "SEEK", room.videoId, safePos(position), executeAt);
      });
    });

    // Host heartbeat -> drift-correction groundwork (Phase 4/5).
    socket.on("media:sync", ({ position, isPlaying, videoId }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !roomStore.isHost(roomId, socket.id)) return;
      const now = Date.now();
      roomStore.setPlayback(roomId, { isPlaying, position: safePos(position), updatedAt: now });
      socket.to(roomId).emit("media:sync", {
        videoId: videoId ?? null,
        position: safePos(position),
        isPlaying,
        serverTimestamp: now,
      });
    });

    socket.on("media:ended", () => {
      // Phase 7 will advance the queue here.
      withHost(socket, (roomId) => {
        roomStore.setPlayback(roomId, { isPlaying: false, position: 0, updatedAt: Date.now() });
      });
    });
  });

  return io;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safePos(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

/** Run `fn` only if the socket is the validated host of its room. */
function withHost(
  socket: { data: SocketData; id: string },
  fn: (roomId: string, room: NonNullable<ReturnType<typeof roomStore.getRoom>>) => void
) {
  const roomId = socket.data.roomId;
  if (!roomId || !roomStore.isHost(roomId, socket.id)) return;
  const room = roomStore.getRoom(roomId);
  if (!room) return;
  fn(roomId, room);
}

/** Emit a scheduled media command to everyone in the room (host included). */
function broadcastScheduled(
  io: IOServer,
  roomId: string,
  action: MediaAction,
  videoId: string | null,
  position: number,
  executeAt = Date.now() // default: act now (used for PAUSE/LOAD)
) {
  const serverTimestamp = Date.now();
  const event = { action, roomId, videoId, position, serverTimestamp, executeAt };
  const channel =
    action === "PLAY" ? "media:play"
    : action === "PAUSE" ? "media:pause"
    : action === "SEEK" ? "media:seek"
    : "media:load";
  io.to(roomId).emit(channel, event);
}

function handleLeave(io: IOServer, socket: { id: string; data: SocketData }) {
  const { room, removedUser, hostChanged, roomId } =
    roomStore.removeUserBySocket(socket.id);
  socket.data.roomId = undefined;
  if (!roomId) return;

  if (removedUser) {
    io.to(roomId).emit("user:left", { socketId: removedUser.socketId });
  }
  if (room && hostChanged) {
    io.to(roomId).emit("host:changed", { hostSocketId: room.hostSocketId });
  }
  if (room) {
    io.to(roomId).emit("room:state", room);
  }
}
