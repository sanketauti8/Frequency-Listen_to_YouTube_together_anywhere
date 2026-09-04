"use client";

interface Props {
  title: string | null;
  isPlaying: boolean;
  hasVideo: boolean;
}

export function PlaybackStatus({ title, isPlaying, hasVideo }: Props) {
  if (!hasVideo) {
    return (
      <p className="text-sm text-white/40">
        Nothing playing yet.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <span
        className={`h-2 w-2 rounded-full ${isPlaying ? "bg-mint animate-pulse" : "bg-white/30"}`}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title ?? "Now playing"}</p>
        <p className="text-xs text-white/40">
          {isPlaying ? "Playing — in sync" : "Paused"}
        </p>
      </div>
    </div>
  );
}
