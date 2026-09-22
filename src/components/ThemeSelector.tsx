import { useState, useRef, useEffect } from 'react';
import { Icon } from './Icons';
import { playSound } from '../lib/sound';

export type VisualTheme = 'bauhaus' | 'pulse' | 'cyber';

interface Props {
  theme: VisualTheme;
  onSelectTheme: (t: VisualTheme) => void;
  className?: string;
  compact?: boolean;
}

interface ThemeOption {
  key: VisualTheme;
  label: string;
  shortLabel: string;
  tagline: string;
  accentColor: string;
  icon: (p: { className?: string }) => JSX.Element;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    key: 'bauhaus',
    label: 'Bauhaus',
    shortLabel: 'Bauhaus',
    tagline: 'Architectural • Primary Red',
    accentColor: '#e11d48',
    icon: Icon.Square,
  },
  {
    key: 'pulse',
    label: 'Pulse',
    shortLabel: 'Pulse',
    tagline: 'Vibrant • Violet Glow',
    accentColor: '#8b5cf6',
    icon: Icon.Sparkle,
  },
  {
    key: 'cyber',
    label: 'Cyber Obsidian',
    shortLabel: 'Cyber',
    tagline: 'Matrix • Neon Halos',
    accentColor: '#10b981',
    icon: Icon.Terminal,
  },
];

export function ThemeSelector({
  theme,
  onSelectTheme,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentOption = THEME_OPTIONS.find((t) => t.key === theme) ?? THEME_OPTIONS[0];
  const CurrentIcon = currentOption.icon;

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (nextTheme: VisualTheme) => {
    setOpen(false);
    if (nextTheme === theme) return;
    onSelectTheme(nextTheme);
    playSound('tick');
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Dropdown Box Trigger */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Theme: currently ${currentOption.label}. Click to choose theme.`}
        className="group/theme flex w-full items-center justify-between gap-2 rounded-xl border border-line-soft bg-canvas/70 px-3 py-2 text-meta text-ink-soft shadow-xs transition duration-150 hover:border-line hover:bg-panel hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-transform duration-150 group-hover/theme:scale-110"
            style={{
              backgroundColor: `${currentOption.accentColor}18`,
              color: currentOption.accentColor,
            }}
          >
            <CurrentIcon className="h-3.5 w-3.5" />
          </span>
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-xs font-semibold text-ink-soft group-hover/theme:text-ink">
              Theme:
            </span>
            <span className="text-xs font-bold text-ink truncate">
              {currentOption.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className="h-2 w-2 rounded-full transition-transform duration-150 group-hover/theme:scale-125"
            style={{
              backgroundColor: currentOption.accentColor,
              boxShadow: `0 0 6px ${currentOption.accentColor}80`,
            }}
            aria-hidden="true"
          />
          <Icon.Chevron
            className={`h-3.5 w-3.5 text-ink-faint transition-transform duration-200 group-hover/theme:text-ink ${
              open ? 'rotate-180 text-accent' : ''
            }`}
          />
        </div>
      </button>

      {/* Floating Dropdown Popover */}
      {open && (
        <div
          role="listbox"
          aria-label="Select visual theme"
          className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-line bg-panel p-1.5 shadow-float backdrop-blur-md"
        >
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-faint border-b border-line-soft/60 mb-1 flex items-center justify-between">
            <span>Atmosphere</span>
            <span className="text-[9px] font-mono lowercase opacity-70">3 themes</span>
          </div>

          <div className="space-y-0.5">
            {THEME_OPTIONS.map((opt) => {
              const isSelected = opt.key === theme;
              const OptIcon = opt.icon;

              return (
                <button
                  key={opt.key}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.key)}
                  className={`group/opt flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                    isSelected
                      ? 'bg-accent/10 text-ink font-semibold'
                      : 'text-ink-soft hover:bg-canvas/80 hover:text-ink'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-transform duration-150 group-hover/opt:scale-110"
                      style={{
                        backgroundColor: `${opt.accentColor}20`,
                        color: opt.accentColor,
                      }}
                    >
                      <OptIcon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-tight truncate flex items-center gap-1.5">
                        <span>{opt.label}</span>
                        {isSelected && (
                          <span
                            className="h-1.5 w-1.5 rounded-full inline-block"
                            style={{ backgroundColor: opt.accentColor }}
                          />
                        )}
                      </p>
                      <p className="text-[10px] text-ink-faint leading-tight truncate mt-0.5">
                        {opt.tagline}
                      </p>
                    </div>
                  </div>

                  {isSelected ? (
                    <Icon.Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                  ) : (
                    <span
                      className="h-2 w-2 rounded-full opacity-25 group-hover/opt:opacity-80 transition-opacity"
                      style={{ backgroundColor: opt.accentColor }}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
