'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, PlayCircle, ShieldCheck } from 'lucide-react';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoader: Promise<void> | null = null;

function loadYouTubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('YouTube player is only available in the browser.'));
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoader) return apiLoader;
  apiLoader = new Promise<void>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const scriptExists = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!scriptExists) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('The YouTube player could not be loaded. Check network or content-blocking settings.'));
      document.head.appendChild(script);
    }
    window.setTimeout(() => {
      if (!window.YT?.Player) reject(new Error('The YouTube player did not finish loading.'));
    }, 12000);
  }).catch(error => {
    apiLoader = null;
    throw error;
  });
  return apiLoader;
}

export function normalizeYouTubeVideoId(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
    }
    if (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com' || url.hostname === 'm.youtube.com') {
      const id = url.searchParams.get('v') || '';
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
      const parts = url.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && /^[A-Za-z0-9_-]{11}$/.test(parts[1] || '')) {
        return parts[1];
      }
    }
  } catch {
    return '';
  }
  return '';
}

export function YouTubeWatchPlayer({ videoId, title, onStarted, onCompleted, onClose, initialPosition = 0, onPosition }: {
  videoId: string;
  title: string;
  onStarted: () => void;
  onCompleted: () => void;
  onClose?: () => void;
  initialPosition?: number;
  onPosition?: (positionSeconds: number, durationSeconds: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement|null>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<number|null>(null);
  const watchedSecondsRef = useRef(0);
  const lastTimeRef = useRef<number|null>(null);
  const completionRef = useRef(false);
  const startedRef = useRef(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [apiReady, setApiReady] = useState(false);
  const onStartedRef = useRef(onStarted);
  const onCompletedRef = useRef(onCompleted);
  const onPositionRef = useRef(onPosition);
  const initialPositionRef = useRef(initialPosition);
  const normalizedVideoId = normalizeYouTubeVideoId(videoId);

  useEffect(() => { onStartedRef.current = onStarted; }, [onStarted]);
  useEffect(() => { onCompletedRef.current = onCompleted; }, [onCompleted]);
  useEffect(() => { onPositionRef.current = onPosition; }, [onPosition]);
  useEffect(() => { initialPositionRef.current = initialPosition; }, [initialPosition]);

  useEffect(() => {
    if (!normalizedVideoId) {
      setError('This resource does not contain a usable YouTube video ID.');
      return;
    }
    startedRef.current = false;
    completionRef.current = false;
    watchedSecondsRef.current = 0;
    lastTimeRef.current = null;
    setProgress(0);
    setDuration(0);
    setError('');
    let cancelled = false;
    loadYouTubeApi()
      .then(() => { if (!cancelled) setApiReady(true); })
      .catch((cause) => {
        if (!cancelled) {
          setApiReady(false);
          setError(cause instanceof Error ? cause.message : 'YouTube playback could not use the enhanced player. The embedded fallback is available.');
        }
      });
    return () => { cancelled = true; };
  }, [normalizedVideoId]);

  useEffect(() => {
    if (!apiReady || !normalizedVideoId) return;
    let cancelled = false;
    let player: any = null;
    const stopTimer = () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    const checkProgress = () => {
      if (!player || player.getPlayerState?.() !== 1) return;
      const current = Number(player.getCurrentTime?.() || 0);
      const total = Number(player.getDuration?.() || 0);
      if (total > 0) setDuration(total);
      if (total > 0) onPositionRef.current?.(current, total);
      if (lastTimeRef.current !== null) {
        const delta = current - lastTimeRef.current;
        // Credit only continuous playback. Seeking across a section does not
        // count as watching it; buffering and short seeks are ignored.
        if (delta > 0 && delta <= 4.5) watchedSecondsRef.current += Math.min(delta, 1.5);
      }
      lastTimeRef.current = current;
      if (total > 0) {
        const ratio = Math.min(1, watchedSecondsRef.current / total);
        setProgress(ratio);
        if (!completionRef.current && ratio >= 1) {
          completionRef.current = true;
          onCompletedRef.current();
        }
      }
    };

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT?.Player) return;
      player = new window.YT.Player(containerRef.current, {
        width: '100%',
        height: '390',
        videoId: normalizedVideoId,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, enablejsapi: 1, origin: window.location.origin },
        events: {
          onReady: (event: any) => {
            player = event.target;
            playerRef.current = event.target;
            if (initialPositionRef.current > 1) {
              try { event.target.seekTo(initialPositionRef.current, true); } catch { /* Continue from current position if seek is rejected. */ }
            }
            setError('');
          },
          onStateChange: (event: any) => {
            if (event.data === 1) {
              if (!startedRef.current) { startedRef.current = true; onStartedRef.current(); }
              lastTimeRef.current = Number(event.target.getCurrentTime?.() || 0);
              if (timerRef.current === null) timerRef.current = window.setInterval(checkProgress, 1000);
            } else {
              checkProgress();
              stopTimer();
            }
          },
          onError: () => setError('YouTube could not play this video. It may be restricted, removed or unavailable for embedding.'),
        },
      });
      playerRef.current = player;
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'YouTube player failed to load.');
    });

    return () => {
      cancelled = true;
      stopTimer();
      try { playerRef.current?.destroy?.(); } catch { /* Ignore teardown errors. */ }
      playerRef.current = null;
    };
  }, [apiReady, normalizedVideoId]);

  const percent = Math.round(progress * 100);
  return <section className="youtube-watch-player" aria-label={`Video player: ${title}`}>
    <div className="youtube-player-heading">
      <div><PlayCircle size={18}/><b>{title}</b></div>
      <div className="youtube-player-heading-actions">
        {normalizedVideoId && <a href={`https://www.youtube.com/watch?v=${normalizedVideoId}`} target="_blank" rel="noopener noreferrer">Open on YouTube <ExternalLink size={13}/></a>}
        {onClose && <button type="button" className="text-btn" onClick={onClose}>Close player</button>}
      </div>
    </div>
    <div className="youtube-player-frame">
      {normalizedVideoId
        ? apiReady
          ? <div ref={containerRef} className="youtube-player-mount"/>
          : <iframe
              src={`https://www.youtube-nocookie.com/embed/${normalizedVideoId}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(typeof window === 'undefined' ? '' : window.location.origin)}&autoplay=1`}
              title={`YouTube video player: ${title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
        : null}
    </div>
    {error&&<p className="auth-message error" role="alert">{error}{normalizedVideoId && <> <a href={`https://www.youtube.com/watch?v=${normalizedVideoId}`} target="_blank" rel="noopener noreferrer">Open the original video</a></>}</p>}
    <div className="youtube-watch-progress"><div><span>Watched in this player</span><b>{percent}%</b></div><div className="youtube-watch-track"><span style={{width:`${percent}%`}}/></div><small><ShieldCheck size={13}/> Completion is recorded only after genuine 100% continuous playback. Seeking does not count.</small></div>
  </section>;
}
