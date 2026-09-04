"use client";

import { useState } from "react";

// A stable, embeddable demo video for Phase 2 testing.
const DEMO_VIDEO_ID = "dQw4w9WgXcQ";

interface Props {
  hasVideo: boolean;
  isPlaying: boolean;
  onLoad: (videoId: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
}

/** Accepts a raw 11-char ID or any common YouTube URL and returns the ID. */
function extractVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    s.match(/embed\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function HostControls({
  hasVideo,
  isPlaying,
  onLoad,
  onPlay,
  onPause,
  onRestart,
}: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadFromInput() {
    const id = extractVideoId(input);
    if (!id) {
      setError("Paste a YouTube link or 11-character video ID.");
      return;
    }
    setError(null);
    setInput("");
    onLoad(id);
  }

  return (
    <section className="card space-y-3">
      <h2 className="text-sm font-medium text-white/60">Host controls</h2>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadFromInput()}
          placeholder="YouTube link or video ID"
          className="field"
          inputMode="url"
        />
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={loadFromInput}>
            Load
          </button>
          <button
            className="btn-ghost whitespace-nowrap"
            onClick={() => onLoad(DEMO_VIDEO_ID)}
            title="Load a known-good demo video"
          >
            Demo
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-signal-400">{error}</p>}

      <div className="flex gap-2">
        {isPlaying ? (
          <button className="btn-primary flex-1" onClick={onPause} disabled={!hasVideo}>
            Pause
          </button>
        ) : (
          <button className="btn-primary flex-1" onClick={onPlay} disabled={!hasVideo}>
            Play
          </button>
        )}
        <button className="btn-ghost" onClick={onRestart} disabled={!hasVideo}>
          Restart
        </button>
      </div>
    </section>
  );
}
