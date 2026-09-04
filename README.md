# Frequency — synchronized group YouTube listening

Everyone in a room loads the **same** YouTube video on their **own** phone and hears it at
nearly the same playback position. The host searches and controls playback; listeners stay
in sync. Audio is never streamed through our server — each phone plays YouTube directly, so
everyone can use their own AirPods / Bluetooth headphones normally.

> **Status:** Phases 1–3 are complete (rooms + realtime, shared video load, play/pause sync).
> The clock-offset handshake, mobile audio gate, host transfer, and join-in-progress catch-up
> are already in place because Phase 3 needs them to work on real phones. Search (Phase 6) has a
> finished server route; its UI and the queue (Phase 7) are scaffolded stubs. See
> [Roadmap](#roadmap).

---

## How it works (architecture)

One Node process serves **both** Next.js and Socket.IO on a single port (`server.ts`). That keeps
local phone testing to a single URL and deployment to a single service.

```
Browser (phone)                        Server (Node)
────────────────                       ─────────────
Next.js UI ─┐                          ┌─ Next.js request handler
            ├── same origin ──────────►│
Socket.IO ──┘                          └─ Socket.IO  ──► room-manager (in-memory store)
   │                                                        (RoomStore interface)
   └─ YouTube IFrame API ──► youtube.com   (audio/video, direct — never via our server)
```

**Sync model.** The server is the single source of truth and the only clock that matters.
The host's control actions (`media:play/pause/seek/load`) are sent to the server, which stamps
them and rebroadcasts a **scheduled command** with an `executeAt` server timestamp. Every client
converts `executeAt` into its own clock (using an NTP-style offset it measures continuously) and
waits until that moment to act — so all phones fire together instead of chasing each other.

```jsonc
// server -> all clients
{ "action": "PLAY", "roomId": "482931", "videoId": "…",
  "position": 83.45, "serverTimestamp": 1788491500000, "executeAt": 1788491500700 }
```

**Host authority.** Clients never send their "host" status. The server checks ownership against
the room's `hostSocketId` on every media event and ignores anything from non-hosts.

**Migrating to Redis later.** All room reads/writes go through the `RoomStore` interface in
`server/room-manager.ts`. Ship a `RedisRoomStore` implementing the same interface and swap the
one exported singleton — no handler changes.

### Project structure

```
server.ts                     Combined Next.js + Socket.IO entry
server/
  socket-server.ts            Realtime protocol: rooms, host-authoritative media, scheduling
  room-manager.ts             RoomStore interface + in-memory implementation (swap for Redis)
lib/
  room-types.ts               Shared domain types + typed Socket.IO event contract
  sync.ts                     Clock offset (NTP-style), expected-position + drift math
  socket.ts                   Browser Socket.IO singleton + time-sync handshake
  youtube.ts                  YouTube Data API v3 search (server-only)
app/
  page.tsx                    Landing: create / join
  room/[roomId]/page.tsx      Room: wires socket events to the player, host controls
  api/youtube/search/route.ts GET /api/youtube/search (rate-limited, key server-side)
components/
  YouTubePlayer.tsx           IFrame API wrapper with an imperative control handle
  RoomHeader.tsx  ListenerList.tsx  PlaybackStatus.tsx  HostControls.tsx
  SearchBar.tsx  SearchResults.tsx  Queue.tsx     (Phase 6/7 stubs)
```

---

## Setup

Requires **Node 18.17+** (Node 20 recommended).

```bash
npm install
cp .env.example .env
```

Then open `.env`:

```bash
# Only needed for search (Phase 6). Rooms + sync work without it.
YOUTUBE_API_KEY=your_key_here
PORT=3000
```

Get a key at <https://console.cloud.google.com> → create a project → enable **YouTube Data API v3**
→ **Credentials** → **Create credentials → API key**. The key is read only on the server; it is
never sent to the browser.

---

## Local development

```bash
npm run dev
```

`nodemon` runs the TypeScript server via `tsx` and restarts it when files under `server/` change;
Next.js handles hot-reload for everything in `app/` and `components/`. Open
<http://localhost:3000>.

Production build & run:

```bash
npm run build   # next build
npm start       # NODE_ENV=production tsx server.ts
```

Other scripts: `npm run typecheck`, `npm run lint`.

> In React Strict Mode (dev only) effects mount twice, so you may see a quick join→leave→join in
> the server logs. It converges to the correct state and does not happen in production.

---

## Testing with two phones

The magic number is your computer's **LAN IP**. Find it:

- macOS: `ipconfig getifaddr en0` (Wi-Fi) — e.g. `192.168.1.42`
- Linux: `hostname -I | awk '{print $1}'`
- Windows: `ipconfig` → IPv4 Address

### Same Wi-Fi network (easiest)

1. `npm run dev` on your computer.
2. Put both phones on the **same Wi-Fi** as the computer.
3. On phone A open `http://<LAN-IP>:3000` and tap **Create a room**.
4. On phone B open the same URL, enter the 6-digit code, tap **Join**.
5. Tap **Tap to enable audio** on each phone once (mobile autoplay rule).
6. On the host, tap **Demo** (or paste a YouTube link) → **Play**. Both phones should play together;
   **Pause** freezes both.
7. Connect AirPods / Bluetooth headphones to each phone as usual — audio is per-device.

If a phone can't reach the URL, your Wi-Fi likely has *client isolation* on, or a firewall is
blocking the port. Allow inbound `3000`, or use the tunnel method below.

### Different networks (or phones on cellular)

Expose your local server with a tunnel — no deploy needed:

```bash
npx localtunnel --port 3000
# or: ngrok http 3000   (https://ngrok.com)
```

Open the printed `https://…` URL on both phones. Because the app connects Socket.IO to the **same
origin** as the page, tunnels and cellular work with no extra config. HTTPS also makes the
"copy room code" button reliable on iOS.

### What to look for

- Play/pause happen within a few hundred milliseconds on both devices.
- A phone that **joins after** playback starts catches up to the current position automatically.
- If the **host leaves**, another connected phone is promoted to host (its controls appear).

---

## Deployment

Because this is a stateful, single-process WebSocket server (in-memory rooms), deploy it as a
**long-running Node service**, not to a serverless/edge platform.

Good fits: **Railway**, **Render**, **Fly.io**, or any VPS.

1. Set env vars: `YOUTUBE_API_KEY`, and `PORT` if the platform doesn't inject one (the server reads
   `process.env.PORT`).
2. Build command: `npm run build`
3. Start command: `npm start`
4. Ensure WebSockets are enabled (they are by default on the platforms above).

**Scaling past one instance:** in-memory rooms live in a single process, so a user must stick to
the instance holding their room. Before scaling horizontally, implement `RedisRoomStore`
(`server/room-manager.ts`) and add the Socket.IO Redis adapter so events fan out across instances.
The rate limiter in the search route should move to Redis at the same time.

---

## Roadmap

| Phase | Scope | State |
|------:|-------|-------|
| 1 | Create/join room + Socket.IO | ✅ done |
| 2 | Load the same video on every phone | ✅ done |
| 3 | Synchronize play / pause (scheduled `executeAt`) | ✅ done |
| 4 | Synchronize seek + position | ▶ seek wired; heartbeat groundwork in place |
| 5 | Full drift correction (150 / 500 ms bands) | ▶ thresholds + hard-seek in `lib/sync.ts`; nudge band pending |
| 6 | YouTube search | ▶ API route + `lib/youtube.ts` done; UI stubs pending |
| 7 | Queue + auto-advance | ⧗ events defined; UI pending |
| 8 | Reconnect, host transfer, mobile autoplay | ▶ host transfer, audio gate, join-in-progress done; reconnect hardening pending |
| 9 | Mobile UI polish | ⧗ base styling in place |

### Socket event reference

Client → server: `room:create`, `room:join`, `room:leave`, `media:load`, `media:play`,
`media:pause`, `media:seek`, `media:sync`, `media:ended`, `queue:add`, `queue:remove`,
`queue:next`, `time:sync`.

Server → client: `room:state`, `media:load`, `media:play`, `media:pause`, `media:seek`,
`media:sync`, `user:joined`, `user:left`, `host:changed`, `time:sync`, `error:room`.

Full payload types live in `lib/room-types.ts`.
