"use client";

import type { RoomUser } from "@/lib/room-types";

interface Props {
  users: RoomUser[];
  selfSocketId: string | null;
}

export function ListenerList({ users, selfSocketId }: Props) {
  return (
    <section className="card">
      <h2 className="mb-3 text-sm font-medium text-white/60">In the room</h2>
      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.socketId} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-700 text-xs">
                {u.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-sm">
                {u.name}
                {u.socketId === selfSocketId && (
                  <span className="text-white/40"> (you)</span>
                )}
              </span>
            </span>
            {u.isHost && (
              <span className="text-xs font-medium text-signal-400">Host</span>
            )}
          </li>
        ))}
        {users.length === 0 && (
          <li className="text-sm text-white/40">Waiting for people to join…</li>
        )}
      </ul>
    </section>
  );
}
