/**
 * Client-side sync math. Pure and framework-free.
 *
 * The server timestamps everything with its own clock. Phones' clocks are not
 * aligned with the server (or each other), so before we can honour an
 * `executeAt` server timestamp we estimate the offset between our clock and the
 * server's, using an NTP-style round trip.
 */

import type { RoomState, SyncBroadcast } from "./room-types";

// Drift-correction thresholds (Phase 4/5). Kept here so server + client agree.
export const DRIFT = {
  IGNORE_MS: 150, // below this: do nothing
  SOFT_MS: 500, // 150–500ms: gentle nudge; above 500ms: hard seek
};

/** offset = serverClock - localClock (ms). serverNow ≈ Date.now() + offset. */
let clockOffset = 0;
let bestRtt = Infinity;

/**
 * Feed one round-trip sample. `clientSent`/`clientRecv` are local timestamps;
 * `serverTime` is the server clock captured when it replied. We keep the
 * estimate from the lowest-latency sample (least noisy).
 */
export function recordTimeSample(clientSent: number, serverTime: number, clientRecv: number) {
  const rtt = clientRecv - clientSent;
  if (rtt < 0) return;
  if (rtt <= bestRtt) {
    bestRtt = rtt;
    // Server clock at the moment we received ≈ serverTime + rtt/2.
    clockOffset = serverTime + rtt / 2 - clientRecv;
  }
}

export function resetTimeSync() {
  clockOffset = 0;
  bestRtt = Infinity;
}

/** Our best estimate of the server's clock right now. */
export function serverNow(): number {
  return Date.now() + clockOffset;
}

/** Convert a server timestamp into a local `Date.now()`-comparable value. */
export function toLocalTime(serverTimestamp: number): number {
  return serverTimestamp - clockOffset;
}

export function getClockOffset(): number {
  return clockOffset;
}

/**
 * Where a listener should be *right now* given authoritative state.
 * Works from either full RoomState or a periodic SyncBroadcast.
 */
export function expectedPositionNow(
  state: Pick<RoomState, "isPlaying" | "position" | "updatedAt">
): number {
  if (!state.isPlaying) return state.position;
  const elapsed = (serverNow() - state.updatedAt) / 1000;
  return Math.max(0, state.position + elapsed);
}

export function expectedFromBroadcast(b: SyncBroadcast): number {
  if (!b.isPlaying) return b.position;
  const elapsed = (serverNow() - b.serverTimestamp) / 1000;
  return Math.max(0, b.position + elapsed);
}

/**
 * Given the local player's current time and the expected time, decide what to
 * do. Returns the correction to apply (Phase 5 will use the full band).
 */
export function driftDecision(localSeconds: number, expectedSeconds: number): {
  action: "none" | "nudge" | "seek";
  driftMs: number;
  target: number;
} {
  const driftMs = Math.abs(expectedSeconds - localSeconds) * 1000;
  if (driftMs < DRIFT.IGNORE_MS) return { action: "none", driftMs, target: expectedSeconds };
  if (driftMs <= DRIFT.SOFT_MS) return { action: "nudge", driftMs, target: expectedSeconds };
  return { action: "seek", driftMs, target: expectedSeconds };
}
