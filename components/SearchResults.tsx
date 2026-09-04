"use client";

// Phase 6 — renders results from /api/youtube/search and lets the host pick or
// queue a video. Placeholder for now.

import type { YouTubeSearchResult } from "@/lib/youtube";

interface Props {
  results: YouTubeSearchResult[];
  onSelect: (r: YouTubeSearchResult) => void;
  onQueue?: (r: YouTubeSearchResult) => void;
}

export function SearchResults(_props: Props) {
  return null;
}
