/**
 * Browser Socket.IO client. One shared connection per tab.
 * Also runs the clock-offset handshake used by lib/sync.ts.
 */

"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./room-types";
import { recordTimeSample, resetTimeSync } from "./sync";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;
let timeSyncTimer: ReturnType<typeof setInterval> | null = null;

export function getSocket(): AppSocket {
  if (socket) return socket;

  // Same-origin: connecting with no URL uses the page's host automatically,
  // which is exactly what we want for LAN / tunnel / prod.
  socket = io({
    autoConnect: true,
    transports: ["websocket", "polling"],
  });

  socket.on("connect", () => {
    resetTimeSync();
    runTimeSyncBurst();
  });

  socket.on("time:sync", ({ clientSent, serverTime }) => {
    recordTimeSample(clientSent, serverTime, Date.now());
  });

  // Re-estimate offset periodically to counter clock drift.
  if (timeSyncTimer) clearInterval(timeSyncTimer);
  timeSyncTimer = setInterval(() => pingTime(), 10_000);

  return socket;
}

function pingTime() {
  socket?.emit("time:sync", { clientSent: Date.now() });
}

/** Fire a few samples quickly on connect to converge the offset fast. */
function runTimeSyncBurst() {
  let n = 0;
  const t = setInterval(() => {
    pingTime();
    if (++n >= 5) clearInterval(t);
  }, 200);
}

export function disconnectSocket() {
  if (timeSyncTimer) clearInterval(timeSyncTimer);
  timeSyncTimer = null;
  socket?.disconnect();
  socket = null;
}
