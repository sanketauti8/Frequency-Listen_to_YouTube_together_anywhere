// Makes the YouTube IFrame API globals type-safe. `YT` namespace comes from
// the @types/youtube package.
export {};

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}
