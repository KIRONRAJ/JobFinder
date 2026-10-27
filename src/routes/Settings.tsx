import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icons';
import { TabStrip } from '../components/TabStrip';
import { MatchaPageHead } from '../components/matcha/MatchaPageHead';
import { useMatcha } from '../lib/useMatcha';
import { Toggle } from '../components/Toggle';
import { ThemeSelector, type VisualTheme } from '../components/ThemeSelector';
import { AuditView } from '../components/AuditView';
import { ServerLogView } from '../components/ServerLogView';
import { playSound, setSoundEnabled } from '../lib/sound';
import { api, fetchAudioBlob, type VoiceSettingsResponse, type VoiceOption } from '../api';

type Tab = 'appearance' | 'voice' | 'audit' | 'server';

const TABS: { key: Tab; label: string; icon: (p: { className?: string }) => JSX.Element }[] = [
  { key: 'appearance', label: 'Appearance', icon: Icon.Palette },
  { key: 'voice', label: 'Voice Assistant', icon: Icon.Volume },
  { key: 'audit', label: 'Audit log', icon: Icon.Scroll },
  { key: 'server', label: 'Server log', icon: Icon.Server },
];

export interface AppearanceProps {
  dark: boolean;
  onToggleDark: () => void;
  theme: VisualTheme;
  onSelectTheme: (t: VisualTheme) => void;
  wallpaper: boolean;
  onToggleWallpaper: () => void;
  wallpaperDim: number;
  onSetWallpaperDim: (v: number) => void;
  sound: boolean;
  onToggleSound: () => void;
}

/** One settings row: label + description on the left, control on the right.
 *  Three rows shared a shape, so they share a component. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  const matcha = useMatcha();
  return (
    <div
      className={
        matcha
          ? 'mx-srow flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line-soft py-5'
          : 'flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 py-4 last:border-b-0'
      }
    >
      <div className="min-w-0 flex-1">
        <p className={matcha ? 'text-heading font-medium text-ink' : 'text-meta font-medium text-ink'}>{label}</p>
        <p className={matcha ? 'mt-1 text-meta leading-snug text-ink-soft' : 'mt-0.5 text-micro leading-snug text-ink-soft'}>{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Appearance({
  dark,
  onToggleDark,
  theme,
  onSelectTheme,
  wallpaper,
  onToggleWallpaper,
  wallpaperDim,
  onSetWallpaperDim,
  sound,
  onToggleSound,
}: AppearanceProps) {
  const matcha = useMatcha();
  return (
    <div className={matcha ? 'mx-sgroup border-b border-line-soft' : 'overflow-hidden rounded-2xl border border-line bg-panel'}>
      {matcha && <h2 className="mx-display-sm mb-5 font-display-matcha font-normal">Appearance</h2>}
      <Row label="Dark mode" hint="Also available as a one-click toggle in the sidebar.">
        <Toggle on={dark} onChange={onToggleDark} label="Dark mode" />
      </Row>

      <Row
        label="Theme"
        hint="Bauhaus is architectural and red; Pulse is violet and soft; Cyber Obsidian is neon on black. Independent of light/dark."
      >
        <ThemeSelector theme={theme} onSelectTheme={onSelectTheme} />
      </Row>

      <Row
        label="Background photo"
        hint="A new random Pexels photo behind the app each day. Works under any theme."
      >
        <Toggle on={wallpaper} onChange={onToggleWallpaper} label="Background photo" />
      </Row>

      {/* Only meaningful while a photo is actually showing. */}
      {wallpaper && (
        <Row label="Photo dim" hint="How far the photo is pushed behind the interface.">
          <div className="flex w-44 items-center gap-3">
            <input
              id="wallpaper-dim"
              type="range"
              min={0}
              max={100}
              value={wallpaperDim}
              onChange={(e) => onSetWallpaperDim(Number(e.target.value))}
              aria-label="Background photo dim"
              className="w-full accent-accent"
            />
            <span className="w-10 shrink-0 text-right font-mono text-micro text-ink-soft">
              {wallpaperDim}%
            </span>
          </div>
        </Row>
      )}

      <Row label="Sound" hint="Short confirmation notes on saves, status changes and celebrations.">
        <Toggle
          on={sound}
          // Playing a note on the click that turns it on is the toggle's own
          // confirmation. The module flag has to flip synchronously or this
          // note races the App-level effect that mirrors it and fires silently.
          onChange={() => {
            const next = !sound;
            onToggleSound();
            if (next) {
              setSoundEnabled(true);
              playSound('success');
            }
          }}
          label="Sound"
        />
      </Row>
    </div>
  );
}

function VoiceSettings() {
  const matcha = useMatcha();
  const [data, setData] = useState<VoiceSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [briefingPlaying, setBriefingPlaying] = useState(false);
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
    let cancelled = false;
    api
      .getVoiceSettings()
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load voice settings');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      cleanupAudio();
    };
  }, []);

  const handleSelectVoice = async (key: string) => {
    if (!data || data.voiceKey === key || savingKey) return;
    setSavingKey(key);
    try {
      await api.setVoiceSetting(key);
      setData((prev) => (prev ? { ...prev, voiceKey: key, label: prev.availableVoices[key]?.label || key } : null));
      playSound('success');
    } catch (err: any) {
      alert(`Failed to save voice setting: ${err.message}`);
    } finally {
      setSavingKey(null);
    }
  };

  const handlePlaySample = async (key: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingVoice === key) {
      setPlayingVoice(null);
      return;
    }

    setPlayingVoice(key);
    setBriefingPlaying(false);
    try {
      const objectUrl = await fetchAudioBlob(`/api/voice/sample?voice=${encodeURIComponent(key)}`);
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingVoice(null);
        URL.revokeObjectURL(objectUrl);
      };
      audio.onerror = () => {
        setPlayingVoice(null);
        URL.revokeObjectURL(objectUrl);
        alert('Could not play audio sample.');
      };
      await audio.play();
    } catch (err: any) {
      setPlayingVoice(null);
      alert(`Could not stream audio sample: ${err.message}`);
    }
  };

  const handlePlayBriefing = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (briefingPlaying) {
      setBriefingPlaying(false);
      return;
    }

    setBriefingPlaying(true);
    setPlayingVoice(null);
    const voiceParam = data?.voiceKey ? `?voice=${encodeURIComponent(data.voiceKey)}` : '';
    try {
      const objectUrl = await fetchAudioBlob(`/api/voice/briefing${voiceParam}`);
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setBriefingPlaying(false);
        URL.revokeObjectURL(objectUrl);
      };
      audio.onerror = () => {
        setBriefingPlaying(false);
        URL.revokeObjectURL(objectUrl);
        alert('Could not play audio briefing.');
      };
      await audio.play();
    } catch (err: any) {
      setBriefingPlaying(false);
      alert(`Could not generate spoken briefing audio: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-8 text-center text-ink-soft">
        <p className="text-meta">Loading voice assistant configuration…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-600">
        <p className="font-medium text-meta">Voice Assistant Unavailable</p>
        <p className="text-micro mt-1">{error}</p>
      </div>
    );
  }

  const voices = (data.availableVoices ? Object.entries(data.availableVoices) : []) as [string, VoiceOption][];

  return (
    <div className="space-y-6">
      <div className={matcha ? '' : 'overflow-hidden rounded-2xl border border-line bg-panel'}>
        <div className={matcha ? 'mb-5 flex flex-wrap items-end justify-between gap-3' : 'border-b border-line-soft px-5 py-4 flex flex-wrap items-center justify-between gap-3'}>
          <div>
            <h3 className={matcha ? 'mx-display-sm font-display-matcha font-normal' : 'text-meta font-medium text-ink'}>Voice Assistant Personality</h3>
            <p className="mt-0.5 text-micro leading-snug text-ink-soft">
              Active Voice: <span className="font-semibold text-accent">{data.label}</span>. Powered by Microsoft Edge Neural Speech with zero server strain on Homeserver.
            </p>
          </div>
          <button
            onClick={handlePlayBriefing}
            className={`mx-vbtn inline-flex items-center gap-2 rounded-xl px-4 py-2 text-meta font-medium transition-colors ${
              briefingPlaying
                ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30'
                : 'bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20'
            }`}
          >
            {briefingPlaying ? <Icon.Mute className="h-4 w-4" /> : <Icon.Volume className="h-4 w-4" />}
            {briefingPlaying ? 'Stop Briefing' : matcha ? 'Play Daily Briefing' : '📻 Play Daily Briefing'}
          </button>
        </div>

        <div className={matcha ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'divide-y divide-line-soft'}>
          {voices.map(([key, info]) => {
            const isSelected = key === data.voiceKey;
            const isPlayingThis = playingVoice === key;
            return (
              <div
                key={key}
                data-selected={isSelected ? 'true' : 'false'}
                className={
                  matcha
                    ? 'mx-vcard flex flex-col justify-between gap-5 rounded-3xl border p-5'
                    : `flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors ${
                        isSelected ? 'bg-accent/5' : 'hover:bg-panel-2/50'
                      }`
                }
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-meta font-medium text-ink">{info.label}</p>
                    {isSelected && (
                      <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-nano font-semibold text-accent">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-micro text-ink-soft">{info.description}</p>
                  <p className="mt-1 text-nano italic text-ink-faint">"{info.greeting}"</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handlePlaySample(key)}
                    className="mx-vbtn inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-micro font-medium text-ink hover:border-ink-soft transition-colors"
                  >
                    {isPlayingThis ? <Icon.Mute className="h-3.5 w-3.5 text-accent" /> : <Icon.Volume className="h-3.5 w-3.5" />}
                    {isPlayingThis ? 'Stop' : 'Sample'}
                  </button>

                  <button
                    disabled={isSelected || savingKey === key}
                    onClick={() => handleSelectVoice(key)}
                    className={`mx-vbtn rounded-lg px-3 py-1.5 text-micro font-medium transition-colors ${
                      isSelected
                        ? 'bg-accent text-white shadow-xs'
                        : 'border border-line bg-panel hover:bg-panel-2 text-ink'
                    }`}
                  >
                    {savingKey === key ? 'Saving…' : isSelected ? 'Selected' : 'Use Voice'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-line-soft bg-canvas/60 p-4 text-ink-soft text-micro flex items-start gap-3">
        <Icon.Chat className="h-4 w-4 shrink-0 text-accent mt-0.5" />
        <div>
          <p className="font-medium text-ink">Telegram Bot Voice Switcher</p>
          <p className="mt-0.5 leading-relaxed">
            You can also switch voices on the fly from your phone at any time! Send <code className="bg-panel px-1 py-0.5 rounded text-accent">/voice</code> to your bot, or type <code className="bg-panel px-1 py-0.5 rounded text-accent">/voice jarvis</code>, <code className="bg-panel px-1 py-0.5 rounded text-accent">/voice prabhat</code>, or <code className="bg-panel px-1 py-0.5 rounded text-accent">/voice mitchell</code> directly in chat.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Appearance controls used to live in the sidebar rail, where they sat under
 * the nav and filters as a permanent column of switches — fine when there were
 * two, cluttered at five, and with nowhere to explain what any of them did.
 * They're rows on a page now, which also gives the two log views a home: the
 * audit log (what changed, permanently) and the server log (whether the process
 * was healthy, live) are both tracing surfaces, not analysis, so they belong
 * here rather than under Insights.
 */
export function Settings(props: AppearanceProps) {
  const matcha = useMatcha();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = (searchParams.get('tab') as Tab) || 'appearance';

  const setTab = (t: Tab) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t === 'appearance') next.delete('tab');
        else next.set('tab', t);
        return next;
      },
      { replace: true }
    );

  return (
    <div>
      {matcha && <MatchaPageHead eyebrow="System" title="Settings" />}
      <TabStrip items={TABS} active={tab} onPick={setTab} ariaLabel="Settings section" />

      {tab === 'appearance' && <Appearance {...props} />}
      {tab === 'voice' && <VoiceSettings />}
      {tab === 'audit' && <AuditView />}
      {tab === 'server' && <ServerLogView />}
    </div>
  );
}

