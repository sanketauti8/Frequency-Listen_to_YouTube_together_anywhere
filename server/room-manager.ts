/**
 * Room state management.
 *
 * All room reads/writes go through the `RoomStore` interface. The MVP ships an
 * in-memory implementation; to move to Redis later, implement the same
 * interface (e.g. `RedisRoomStore`) and swap the singleton at the bottom —
 * no handler code changes.
 */

import type { QueueItem, RoomState, RoomUser } from "../lib/room-types";

// Result of removing a user — tells the caller whether the host changed or the
// room is now empty (and should stop receiving broadcasts).
export interface RemoveUserResult {
  room: RoomState | null; // null if the room was deleted (last user left)
  removedUser: RoomUser | null;
  hostChanged: boolean;
  roomId: string;
}

export interface RoomStore {
  createRoom(hostSocketId: string, hostName: string): RoomState;
  getRoom(roomId: string): RoomState | undefined;
  getRoomBySocket(socketId: string): RoomState | undefined;

  addUser(roomId: string, user: RoomUser): RoomState | undefined;
  removeUserBySocket(socketId: string): RemoveUserResult;

  isHost(roomId: string, socketId: string): boolean;

  setMedia(
    roomId: string,
    media: { videoId: string; videoTitle?: string; thumbnail?: string }
  ): RoomState | undefined;
  setPlayback(
    roomId: string,
    p: { isPlaying: boolean; position: number; updatedAt: number }
  ): RoomState | undefined;

  addToQueue(roomId: string, item: QueueItem): RoomState | undefined;
  removeFromQueue(roomId: string, videoId: string): RoomState | undefined;
  popQueue(roomId: string): { room: RoomState; next: QueueItem } | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RANDOM_NAMES = [
  "Fox", "Otter", "Wren", "Koi", "Lynx", "Moth", "Sage", "Reef", "Vega", "Juno",
];

function randomName(): string {
  const base = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  return `${base}-${Math.floor(100 + Math.random() * 900)}`;
}

/**
 * Compute the position a client should currently be at, given authoritative
 * state. Used when a listener joins mid-playback.
 */
export function expectedPosition(state: RoomState, serverNow: number): number {
  if (!state.isPlaying) return state.position;
  const elapsed = (serverNow - state.updatedAt) / 1000;
  return Math.max(0, state.position + elapsed);
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, RoomState>();
  private socketToRoom = new Map<string, string>();

  private generateRoomId(): string {
    let code: string;
    do {
      code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostSocketId: string, hostName: string): RoomState {
    const roomId = this.generateRoomId();
    const now = Date.now();
    const host: RoomUser = {
      socketId: hostSocketId,
      name: hostName || randomName(),
      isHost: true,
      joinedAt: now,
    };
    const room: RoomState = {
      roomId,
      hostSocketId,
      videoId: null,
      videoTitle: null,
      thumbnail: null,
      isPlaying: false,
      position: 0,
      updatedAt: now,
      users: [host],
      queue: [],
    };
    this.rooms.set(roomId, room);
    this.socketToRoom.set(hostSocketId, roomId);
    return room;
  }

  getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  getRoomBySocket(socketId: string): RoomState | undefined {
    const roomId = this.socketToRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  addUser(roomId: string, user: RoomUser): RoomState | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    // Idempotent: replace if the same socket somehow re-adds.
    room.users = room.users.filter((u) => u.socketId !== user.socketId);
    room.users.push({
      ...user,
      name: user.name || randomName(),
      // Keep host status consistent with the authoritative hostSocketId.
      isHost: user.socketId === room.hostSocketId,
    });
    this.socketToRoom.set(user.socketId, roomId);
    return room;
  }

  removeUserBySocket(socketId: string): RemoveUserResult {
    const roomId = this.socketToRoom.get(socketId);
    this.socketToRoom.delete(socketId);
    if (!roomId) {
      return { room: null, removedUser: null, hostChanged: false, roomId: "" };
    }
    const room = this.rooms.get(roomId);
    if (!room) {
      return { room: null, removedUser: null, hostChanged: false, roomId };
    }

    const removedUser = room.users.find((u) => u.socketId === socketId) ?? null;
    room.users = room.users.filter((u) => u.socketId !== socketId);

    // Empty room -> delete it.
    if (room.users.length === 0) {
      this.rooms.delete(roomId);
      return { room: null, removedUser, hostChanged: false, roomId };
    }

    // Host left -> promote the earliest-joined remaining user.
    let hostChanged = false;
    if (room.hostSocketId === socketId) {
      const next = [...room.users].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      room.hostSocketId = next.socketId;
      room.users = room.users.map((u) => ({
        ...u,
        isHost: u.socketId === next.socketId,
      }));
      hostChanged = true;
    }

    return { room, removedUser, hostChanged, roomId };
  }

  isHost(roomId: string, socketId: string): boolean {
    const room = this.rooms.get(roomId);
    return !!room && room.hostSocketId === socketId;
  }

  setMedia(
    roomId: string,
    media: { videoId: string; videoTitle?: string; thumbnail?: string }
  ): RoomState | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.videoId = media.videoId;
    room.videoTitle = media.videoTitle ?? null;
    room.thumbnail = media.thumbnail ?? null;
    room.isPlaying = false;
    room.position = 0;
    room.updatedAt = Date.now();
    return room;
  }

  setPlayback(
    roomId: string,
    p: { isPlaying: boolean; position: number; updatedAt: number }
  ): RoomState | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.isPlaying = p.isPlaying;
    room.position = Math.max(0, p.position);
    room.updatedAt = p.updatedAt;
    return room;
  }

  addToQueue(roomId: string, item: QueueItem): RoomState | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    if (!room.queue.some((q) => q.videoId === item.videoId)) {
      room.queue.push(item);
    }
    return room;
  }

  removeFromQueue(roomId: string, videoId: string): RoomState | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.queue = room.queue.filter((q) => q.videoId !== videoId);
    return room;
  }

  popQueue(
    roomId: string
  ): { room: RoomState; next: QueueItem } | undefined {
    const room = this.rooms.get(roomId);
    if (!room || room.queue.length === 0) return undefined;
    const next = room.queue.shift()!;
    return { room, next };
  }
}

// Swap this line for a RedisRoomStore later — nothing else needs to change.
export const roomStore: RoomStore = new InMemoryRoomStore();
