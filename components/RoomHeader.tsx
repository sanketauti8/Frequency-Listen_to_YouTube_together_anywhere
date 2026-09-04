"use client";

import { useState } from "react";

interface Props {
  roomId: string;
  isHost: boolean;
  listenerCount: number;
  connected: boolean;
  onLeave: () => void;
}

export function RoomHeader({ roomId, isHost, listenerCount, connected, onLeave }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail on http/LAN; the code is visible regardless.
    }
  }

  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={copyCode}
          className="group flex items-center gap-2 rounded-xl bg-ink-800 px-3 py-2 text-left"
          title="Copy room code"
        >
          <span className="font-display text-xl tracking-[0.3em] tabular-nums">
            {roomId}
          </span>
          <span className="text-xs text-white/50 group-hover:text-white/80">
            {copied ? "copied" : "copy"}
          </span>
        </button>

        {isHost && (
          <span className="rounded-full bg-signal-500/15 px-3 py-1 text-xs font-medium text-signal-400 ring-1 ring-signal-500/30">
            Host
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-2 text-white/70">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-mint" : "bg-amber"}`}
          />
          {listenerCount} listening
        </span>
        <button onClick={onLeave} className="text-white/50 hover:text-white">
          Leave
        </button>
      </div>
    </header>
  );
}
