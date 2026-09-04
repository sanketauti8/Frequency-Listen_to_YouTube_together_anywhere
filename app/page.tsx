"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSocket } from "@/lib/socket";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function createRoom() {
    setBusy(true);
    setError(null);
    const socket = getSocket();
    socket.emit("room:create", {}, (res) => {
      setBusy(false);
      if (res.ok) router.push(`/room/${res.roomId}`);
      else setError(res.message);
    });
  }

  function joinRoom() {
    const id = code.replace(/\D/g, "").slice(0, 6);
    if (id.length !== 6) {
      setError("Enter the 6-digit room code.");
      return;
    }
    setError(null);
    router.push(`/room/${id}`);
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center gap-10 px-6 py-12">
      <div>
        <h1 className="font-display text-5xl font-bold leading-none">
          Frequency
        </h1>
        <p className="mt-3 text-white/60">
          Listen to YouTube together, anywhere.
        </p>
      </div>

      <div className="space-y-4">
        <button onClick={createRoom} disabled={busy} className="btn-primary w-full text-base">
          {busy ? "Creating…" : "Create a room"}
        </button>

        <div className="flex items-center gap-3 text-xs text-white/30">
          <span className="h-px flex-1 bg-white/10" />
          or join one
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            placeholder="6-digit code"
            inputMode="numeric"
            className="field text-center text-lg tracking-[0.35em] tabular-nums"
          />
          <button onClick={joinRoom} className="btn-ghost px-6">
            Join
          </button>
        </div>

        {error && <p className="text-sm text-signal-400">{error}</p>}
      </div>

      <p className="text-center text-xs text-white/30">
        Each person hears it on their own phone — bring your own headphones.
      </p>
    </main>
  );
}
