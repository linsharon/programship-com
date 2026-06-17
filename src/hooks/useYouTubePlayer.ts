import { useRef, useEffect, useState, useCallback, type RefObject } from 'react';

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
}

interface YTAPI {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: { onReady?: () => void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function extractVideoId(url: string): string | null {
  const m =
    url.match(/[?&]v=([A-Za-z0-9_-]{11})/) ??
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ??
    url.match(/embed\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function useYouTubePlayer(containerRef: RefObject<HTMLDivElement>) {
  const playerRef = useRef<YTPlayer | null>(null);
  const [isReady, setIsReady] = useState(false);

  const ensureAPI = useCallback((): Promise<void> => {
    if (window.YT?.Player) return Promise.resolve();
    return new Promise<void>(resolve => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
      if (!document.querySelector('script[src*="iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    });
  }, []);

  const initPlayer = useCallback(async (videoId: string) => {
    await ensureAPI();
    const container = containerRef.current;
    if (!container || !window.YT?.Player) return;

    playerRef.current?.destroy();
    playerRef.current = null;
    setIsReady(false);

    container.innerHTML = '';
    const div = document.createElement('div');
    container.appendChild(div);

    playerRef.current = new window.YT.Player(div, {
      videoId,
      playerVars: { rel: 0, modestbranding: 1 },
      events: { onReady: () => setIsReady(true) },
    });
  }, [ensureAPI, containerRef]);

  const seekAndPlay = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
    playerRef.current?.playVideo();
  }, []);

  const getCurrentTime = useCallback((): number =>
    playerRef.current?.getCurrentTime() ?? 0,
  []);

  useEffect(() => () => { playerRef.current?.destroy(); }, []);

  return { initPlayer, seekAndPlay, getCurrentTime, isReady };
}
