import { NextResponse } from "next/server";
import { searchYouTube } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Very small in-memory rate limiter (per server instance). Good enough for the
// MVP; move to Redis alongside room state when you scale out.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many searches. Try again in a moment." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) {
    return NextResponse.json({ error: "Missing search query." }, { status: 400 });
  }

  try {
    const results = await searchYouTube(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    // Don't leak the API key or full upstream body to clients.
    const safe = message.includes("YOUTUBE_API_KEY")
      ? "Search is not configured on the server."
      : "YouTube search failed. Try again.";
    return NextResponse.json({ error: safe }, { status: 502 });
  }
}
