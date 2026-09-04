"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

/** Imperative API the room page drives in response to socket events. */
export interface YouTubePlayerHandle {
  load: (videoId: string, opts?: { autoplay?: boolean; startSeconds?: number }) => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getState: () => number;
  isReady: () => boolean;
  mute: () => void;
  unMute: () => void;
  setVolume: (v: number) => void;
}

interface Props {
  onReady?: () => void;
  onEnded?: () => void;
  /** When true, taps on the video surface are swallowed (listeners can't scrub). */
  blockInteraction?: boolean;
}

// Load the IFrame API exactly once, shared across any players.
let apiPromise: Promise<typeof YT> | null = null;
function loadYouTubeApi(): Promise<typeof YT> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<typeof YT>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT as typeof YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(
  function YouTubePlayer({ onReady, onEnded, blockInteraction }, ref) {
    const hostElRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YT.Player | null>(null);
    const readyRef = useRef(false);
    const [, force] = useState(0);

    useImperativeHandle(ref, () => ({
      load: (videoId, opts) => {
        const p = playerRef.current;
        if (!p) return;
        if (opts?.autoplay) {
          p.loadVideoById({ videoId, startSeconds: opts.startSeconds ?? 0 });
        } else {
          p.cueVideoById({ videoId, startSeconds: opts?.startSeconds ?? 0 });
        }
      },
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seek: (seconds, allowSeekAhead = true) =>
        playerRef.current?.seekTo(Math.max(0, seconds), allowSeekAhead),
      getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
      getState: () => playerRef.current?.getPlayerState?.() ?? -1,
      isReady: () => readyRef.current,
      mute: () => playerRef.current?.mute?.(),
      unMute: () => playerRef.current?.unMute?.(),
      setVolume: (v) => playerRef.current?.setVolume?.(Math.min(100, Math.max(0, v))),
    }));

    useEffect(() => {
      let cancelled = false;

      loadYouTubeApi().then((YTapi) => {
        if (cancelled || !hostElRef.current) return;
        playerRef.current = new YTapi.Player(hostElRef.current, {
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 0, // we drive controls ourselves; server stays authoritative
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1, // critical for iOS — avoids fullscreen takeover
            fs: 0,
            iv_load_policy: 3,
          },
          events: {
            onReady: () => {
              readyRef.current = true;
              force((n) => n + 1);
              onReady?.();
            },
            onStateChange: (e) => {
              if (e.data === YTapi.PlayerState.ENDED) onEnded?.();
            },
          },
        });
      });

      return () => {
        cancelled = true;
        playerRef.current?.destroy?.();
        playerRef.current = null;
        readyRef.current = false;
      };
      // Player is created once; imperative handle covers updates.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <div ref={hostElRef} className="absolute inset-0 h-full w-full" />
        {/* Swallow taps so playback stays server-driven. */}
        {blockInteraction && (
          <div
            className="absolute inset-0 z-10"
            aria-hidden
            onClick={(e) => e.preventDefault()}
          />
        )}
      </div>
    );
  }
);
