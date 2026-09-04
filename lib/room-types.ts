/**
 * Shared types used by BOTH the Socket.IO server and the browser client.
 * Keep this file free of any Node- or browser-specific imports so it can be
 * bundled on either side.
 */

// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

export interface RoomUser {
  socketId: string;
  name: string;
  isHost: boolean;
  joinedAt: number; // server time (ms)
}

export interface QueueItem {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  addedBy: string; // socketId
}

/**
 * Authoritative room state, owned by the server.
 * `position` is the playback position (seconds) as of `updatedAt`.
 * A client can extrapolate the *current* position from these three fields:
 *   isPlaying ? position + (serverNow - updatedAt)/1000 : position
 */
export interface RoomState {
  roomId: string;
  hostSocketId: string;
  videoId: string | null;
  videoTitle: string | null;
  thumbnail: string | null;
  isPlaying: boolean;
  position: number; // seconds, as of updatedAt
  updatedAt: number; // server time (ms)
  users: RoomUser[];
  queue: QueueItem[];
}

// ---------------------------------------------------------------------------
// Socket payloads
// ---------------------------------------------------------------------------

/** Actions the host takes that the server schedules for everyone. */
export type MediaAction = "PLAY" | "PAUSE" | "SEEK" | "LOAD";

/** Client -> server: host asks to load a video. */
export interface MediaLoadPayload {
  videoId: string;
  videoTitle?: string;
  thumbnail?: string;
}

/** Client -> server: host reports a position for play/pause/seek. */
export interface HostPositionPayload {
  position: number; // seconds
}

/** Client -> server: host heartbeat used for drift correction (Phase 4/5). */
export interface HostSyncPayload {
  videoId: string | null;
  position: number; // seconds
  isPlaying: boolean;
}

/**
 * Server -> clients: a scheduled media command.
 * Clients convert `executeAt` (a *server* timestamp) into their own clock and
 * wait for it before acting, so every device fires the command together.
 */
export interface ScheduledMediaEvent {
  action: MediaAction;
  roomId: string;
  videoId: string | null;
  position: number; // seconds — where playback should be at executeAt
  serverTimestamp: number; // when the server emitted (ms)
  executeAt: number; // when clients should act (server ms)
}

/** Server -> clients: lightweight periodic sync (Phase 4/5 groundwork). */
export interface SyncBroadcast {
  videoId: string | null;
  position: number; // seconds, as of serverTimestamp
  isPlaying: boolean;
  serverTimestamp: number;
}

/** Result of create/join, returned via ack callback. */
export type RoomResult =
  | { ok: true; roomId: string; state: RoomState; selfSocketId: string }
  | { ok: false; code: RoomErrorCode; message: string };

export type RoomErrorCode =
  | "ROOM_NOT_FOUND"
  | "INVALID_CODE"
  | "NOT_HOST"
  | "ROOM_FULL"
  | "INTERNAL";

// ---------------------------------------------------------------------------
// Typed Socket.IO event maps
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "media:load": (e: ScheduledMediaEvent) => void;
  "media:play": (e: ScheduledMediaEvent) => void;
  "media:pause": (e: ScheduledMediaEvent) => void;
  "media:seek": (e: ScheduledMediaEvent) => void;
  "media:sync": (e: SyncBroadcast) => void;
  "user:joined": (user: RoomUser) => void;
  "user:left": (payload: { socketId: string }) => void;
  "host:changed": (payload: { hostSocketId: string }) => void;
  "time:sync": (payload: { clientSent: number; serverTime: number }) => void;
  "error:room": (payload: { code: RoomErrorCode; message: string }) => void;
}

export interface ClientToServerEvents {
  "room:create": (
    payload: { name?: string },
    ack: (res: RoomResult) => void
  ) => void;
  "room:join": (
    payload: { roomId: string; name?: string },
    ack: (res: RoomResult) => void
  ) => void;
  "room:leave": () => void;

  // Host-only (server validates ownership before acting)
  "media:load": (payload: MediaLoadPayload) => void;
  "media:play": (payload: HostPositionPayload) => void;
  "media:pause": (payload: HostPositionPayload) => void;
  "media:seek": (payload: HostPositionPayload) => void;
  "media:sync": (payload: HostSyncPayload) => void;
  "media:ended": () => void;

  // Queue (Phase 7 — wired but UI arrives later)
  "queue:add": (item: Omit<QueueItem, "addedBy">) => void;
  "queue:remove": (payload: { videoId: string }) => void;
  "queue:next": () => void;

  // Clock offset handshake
  "time:sync": (payload: { clientSent: number }) => void;
}

/** Per-socket data the server attaches for quick lookups. */
export interface SocketData {
  roomId?: string;
  name?: string;
}
