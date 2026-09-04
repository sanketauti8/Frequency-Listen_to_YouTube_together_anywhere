"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { HostControls } from "@/components/HostControls";
import { ListenerList } from "@/components/ListenerList";
import { PlaybackStatus } from "@/components/PlaybackStatus";
import {
  YouTubePlayer,
  type YouTubePlayerHandle,
} from "@/components/YouTubePlayer";
import { RoomHeader } from "@/components/RoomHeader";
import { getSocket } from "@/lib/socket";
import type { RoomState, ScheduledMediaEvent, SyncBroadcast } from "@/lib/room-types";
import {
  driftDecision,
  expectedFromBroadcast,
  expectedPositionNow,
  toLocalTime,
} from "@/lib/sync";

const HEARTBEAT_MS = 3000;

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = String(params.roomId ?? "");

  const [room, setRoom] = useState<RoomState | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<YouTubePlayerHandle>(null);
  const loadedVideoId = useRef<string | null>(null);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Mirror state into refs so socket callbacks read fresh values.
  const roomRef = useRef<RoomState | null>(null);
  const audioRef = useRef(false);
  const selfRef = useRef<string | null>(null);
  useEffect(() => void (roomRef.current = room), [room]);
  useEffect(() => void (audioRef.current = audioEnabled), [audioEnabled]);
  useEffect(() => void (selfRef.current = selfId), [selfId]);

  const isHost = !!room && !!selfId && room.hostSocketId === selfId;
  const hasVideo = !!room?.videoId;

  // --- scheduling: run fn at a server timestamp, converted to local clock ----
  const scheduleAt = useCallback((serverExecuteAt: number, fn: () => void) => {
    const delay = Math.max(0, toLocalTime(serverExecuteAt) - Date.now());
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, delay);
    timers.current.add(t);
  }, []);

  const ensureVideo = useCallback((videoId: string | null) => {
    if (!videoId) return;
    if (loadedVideoId.current !== videoId && playerRef.current?.isReady()) {
      playerRef.current.load(videoId, { autoplay: false });
      loadedVideoId.current = videoId;
    }
  }, []);

  // --- join + all socket listeners ------------------------------------------
  useEffect(() => {
    const socket = getSocket();
    setConnected(socket.connected);
    let firstConnect = true;

    const join = () =>
      socket.emit("room:join", { roomId }, (res) => {
        if (res.ok) {
          setRoom(res.state);
          setSelfId(res.selfSocketId);
          setError(null);
        } else {
          setError(res.message);
        }
      });

    const onConnect = () => {
      setConnected(true);
      // First connect: mount-time join below already fired. Reconnect: rejoin.
      if (!firstConnect) join();
      firstConnect = false;
    };
    const onDisconnect = () => setConnected(false);

    const onState = (s: RoomState) => setRoom(s);
    const onHostChanged = ({ hostSocketId }: { hostSocketId: string }) =>
      setRoom((r) => (r ? { ...r, hostSocketId } : r));

    const onLoad = (e: ScheduledMediaEvent) =>
      scheduleAt(e.executeAt, () => {
        if (!e.videoId) return;
        playerRef.current?.load(e.videoId, { autoplay: false });
        loadedVideoId.current = e.videoId;
      });

    const onPlay = (e: ScheduledMediaEvent) => {
      ensureVideo(e.videoId);
      scheduleAt(e.executeAt, () => {
        playerRef.current?.seek(e.position, true);
        if (audioRef.current) playerRef.current?.play();
        // If audio isn't enabled yet, we stay parked at e.position until the
        // user taps "Enable audio".
      });
    };

    const onPause = (e: ScheduledMediaEvent) =>
      scheduleAt(e.executeAt, () => {
        playerRef.current?.pause();
        playerRef.current?.seek(e.position, true);
      });

    const onSeek = (e: ScheduledMediaEvent) => {
      ensureVideo(e.videoId);
      scheduleAt(e.executeAt, () => {
        playerRef.current?.seek(e.position, true);
        if (audioRef.current && roomRef.current?.isPlaying) {
          playerRef.current?.play();
        }
      });
    };

    // Periodic drift correction for listeners (Phase 4/5 groundwork).
    const onSync = (b: SyncBroadcast) => {
      if (!audioRef.current || !b.isPlaying) return;
      const player = playerRef.current;
      if (!player?.isReady()) return;
      const expected = expectedFromBroadcast(b);
      const decision = driftDecision(player.getCurrentTime(), expected);
      if (decision.action === "seek") player.seek(decision.target, true);
      // "nudge" (150–500ms) is intentionally a no-op until Phase 5.
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onState);
    socket.on("host:changed", onHostChanged);
    socket.on("media:load", onLoad);
    socket.on("media:play", onPlay);
    socket.on("media:pause", onPause);
    socket.on("media:seek", onSeek);
    socket.on("media:sync", onSync);

    join(); // buffered by socket.io until connected

    return () => {
      socket.emit("room:leave");
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onState);
      socket.off("host:changed", onHostChanged);
      socket.off("media:load", onLoad);
      socket.off("media:play", onPlay);
      socket.off("media:pause", onPause);
      socket.off("media:seek", onSeek);
      socket.off("media:sync", onSync);
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
  }, [roomId, scheduleAt, ensureVideo]);

  // --- catch up the player when the video, readiness, or audio changes -------
  useEffect(() => {
    const rs = room;
    if (!rs?.videoId || !playerReady) return;
    ensureVideo(rs.videoId);
    playerRef.current?.seek(expectedPositionNow(rs), true);
    if (rs.isPlaying && audioEnabled) playerRef.current?.play();
    else playerRef.current?.pause();
    // Deliberately excludes rs.position/isPlaying so live control events (which
    // update those) don't retrigger a catch-up seek.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.videoId, playerReady, audioEnabled, ensureVideo]);

  // --- host heartbeat --------------------------------------------------------
  useEffect(() => {
    if (!isHost || !hasVideo) return;
    const socket = getSocket();
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player?.isReady()) return;
      socket.emit("media:sync", {
        videoId: roomRef.current?.videoId ?? null,
        position: player.getCurrentTime(),
        isPlaying: player.getState() === 1, // YT.PlayerState.PLAYING
      });
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [isHost, hasVideo]);

  // --- host actions ----------------------------------------------------------
  const socket = getSocket();
  const hostLoad = (videoId: string) => socket.emit("media:load", { videoId });
  const hostPlay = () =>
    socket.emit("media:play", { position: playerRef.current?.getCurrentTime() ?? 0 });
  const hostPause = () =>
    socket.emit("media:pause", { position: playerRef.current?.getCurrentTime() ?? 0 });
  const hostRestart = () => {
    socket.emit("media:seek", { position: 0 });
    if (!room?.isPlaying) socket.emit("media:play", { position: 0 });
  };

  const leave = () => {
    socket.emit("room:leave");
    router.push("/");
  };

  // Keep the player's mute state aligned with the user's choice, even after a
  // new video loads (YouTube can reset mute on some load paths).
  useEffect(() => {
    if (!playerReady) return;
    if (muted) playerRef.current?.mute();
    else playerRef.current?.unMute();
  }, [muted, playerReady, room?.videoId]);

  // --- personal mute (local only — never touches playback or other users) ---
  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (next) playerRef.current?.mute();
    else playerRef.current?.unMute();
  }

  // --- audio unlock (mobile autoplay) ---------------------------------------
  function enableAudio() {
    setAudioEnabled(true);
    audioRef.current = true;
    const rs = roomRef.current;
    const player = playerRef.current;
    if (rs?.videoId && player?.isReady()) {
      if (rs.isPlaying) {
        player.seek(expectedPositionNow(rs), true);
        player.play(); // real user gesture -> audible
      } else {
        // Prime the element so later server-driven plays are audible on iOS.
        player.play();
        window.setTimeout(() => playerRef.current?.pause(), 60);
      }
    }
  }

  // --- error screen ----------------------------------------------------------
  if (error) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-2xl">Can’t open this room</p>
        <p className="text-white/60">{error}</p>
        <Link href="/" className="btn-primary">
          Back to start
        </Link>
      </main>
    );
  }

  const listeners = room?.users ?? [];

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-4 px-4 py-5">
      <RoomHeader
        roomId={roomId}
        isHost={isHost}
        listenerCount={listeners.length}
        connected={connected}
        onLeave={leave}
      />

      {/* Now playing */}
      <section className="card space-y-3">
        <div className="relative">
          <YouTubePlayer
            ref={playerRef}
            blockInteraction
            onReady={() => setPlayerReady(true)}
            onEnded={() => isHost && socket.emit("media:ended")}
          />

          {/* Tap-to-enable-audio gate (mobile autoplay restriction). */}
          {!audioEnabled && (
            <button
              onClick={enableAudio}
              className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-ink-950/80 backdrop-blur-sm"
            >
              <span className="btn-primary pointer-events-none">
                Tap to enable audio
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <PlaybackStatus
            title={room?.videoTitle ?? null}
            isPlaying={!!room?.isPlaying}
            hasVideo={hasVideo}
          />
          {hasVideo && audioEnabled && (
            <button
              onClick={toggleMute}
              aria-pressed={muted}
              title={muted ? "Unmute my audio" : "Mute my audio"}
              className={`btn-ghost shrink-0 px-3 ${
                muted ? "text-signal-400" : "text-white/70"
              }`}
            >
              {muted ? "🔇 Muted" : "🔊 Mute"}
            </button>
          )}
        </div>
      </section>

      {isHost && (
        <HostControls
          hasVideo={hasVideo}
          isPlaying={!!room?.isPlaying}
          onLoad={hostLoad}
          onPlay={hostPlay}
          onPause={hostPause}
          onRestart={hostRestart}
        />
      )}

      {!isHost && hasVideo && (
        <p className="px-1 text-xs text-white/40">
          The host controls playback — sit back and stay in sync.
        </p>
      )}

      <ListenerList users={listeners} selfSocketId={selfId} />
    </main>
  );
}
