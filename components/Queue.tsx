"use client";

// Phase 7 — upcoming songs, host can remove, auto-advance on media:ended.
// Socket events (queue:add / queue:remove / queue:next) are already defined in
// the contract and handled server-side. Placeholder UI for now.

import type { QueueItem } from "@/lib/room-types";

interface Props {
  items: QueueItem[];
  isHost: boolean;
  onRemove?: (videoId: string) => void;
}

export function Queue(_props: Props) {
  return null;
}
