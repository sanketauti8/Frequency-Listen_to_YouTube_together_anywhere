"use client";

// Phase 6 — YouTube search UI. The backing API route (GET /api/youtube/search)
// is already implemented in app/api/youtube/search/route.ts and lib/youtube.ts.
// Wire this up in Phase 6.

interface Props {
  onSearch: (query: string) => void;
  loading?: boolean;
}

export function SearchBar(_props: Props) {
  return null;
}
