import { useMemo, useState, useRef, useEffect } from 'react';
import { useStagger } from '../../lib/useStagger';
import { todayActions } from '../../lib/priorities';
import { Icon } from '../Icons';
import { fetchAudioBlob } from '../../api';
import type { Application } from '../../types';

interface Props {
  apps: Application[];
}

export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Reuses the same `todayActions` ranking TodayFocus renders below, so this
 * one-line count and that list can never disagree about how many things
 * actually need attention today.
 */
export function subtitleFor(apps: Application[]): string {
  const attention = todayActions(apps, apps.length || 1).length;
  if (attention > 0) return `${attention} ${attention === 1 ? 'thing needs' : 'things need'} attention today`;
  const interviews = apps.filter((a) => a.status === 'interview').length;
  if (interviews > 0) return `${interviews} active interview${interviews === 1 ? '' : 's'} in play`;
  return `${apps.length} application${apps.length === 1 ? '' : 's'} tracked · all caught up`;
}

/** The spoken-briefing player. Shared by the hero's button and the Matcha dashboard's briefing card. */
export function useBriefingAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanupAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  useEffect(() => {
    return cleanupAudio;
  }, []);

  const toggleBriefingAudio = async () => {
    if (isPlaying || isLoading) {
      cleanupAudio();
      setIsPlaying(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const url = await fetchAudioBlob('/api/voice/briefing');
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setIsPlaying(false);
        setIsLoading(false);
        cleanupAudio();
      };
      audio.onerror = () => {
        setIsPlaying(false);
        setIsLoading(false);
        cleanupAudio();
        alert('Could not play audio briefing.');
      };
      await audio.play();
      setIsPlaying(true);
      setIsLoading(false);
    } catch (err: any) {
      setIsPlaying(false);
      setIsLoading(false);
      cleanupAudio();
      alert(`Could not stream audio briefing: ${err.message}`);
    }
  };

  return { isPlaying, isLoading, toggleBriefingAudio };
}

export function DashboardHero({ apps }: Props) {
  const stagger = useStagger<HTMLDivElement>();
  const greeting = useMemo(() => greetingFor(new Date().getHours()), []);
  const subtitle = useMemo(() => subtitleFor(apps), [apps]);
  const { isPlaying, isLoading, toggleBriefingAudio } = useBriefingAudio();

  return (
    <div
      ref={stagger}
      className="mb-8 flex flex-wrap items-end justify-between gap-4"
    >
      <div>
        <h2 data-stagger className="text-title sm:text-display font-black text-ink">
          {greeting}, Jordan
        </h2>
        <p data-stagger className="mt-1.5 text-subhead text-ink-soft">
          {subtitle}
        </p>
      </div>

      <div data-stagger className="shrink-0">
        <button
          onClick={toggleBriefingAudio}
          disabled={isLoading}
          className={`inline-flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-meta font-medium shadow-xs transition-all ${
            isPlaying
              ? 'border border-rose-500/30 bg-rose-500/15 text-rose-600 animate-pulse'
              : 'border border-accent/25 bg-accent/10 hover:bg-accent/20 text-accent'
          }`}
          title="Play today's AI spoken briefing"
        >
          {isPlaying ? (
            <Icon.Mute className="h-4 w-4" />
          ) : (
            <Icon.Volume className="h-4 w-4" />
          )}
          <span>{isLoading ? 'Generating Audio…' : isPlaying ? 'Stop Briefing' : '🔊 Listen to Briefing'}</span>
        </button>
      </div>
    </div>
  );
}
