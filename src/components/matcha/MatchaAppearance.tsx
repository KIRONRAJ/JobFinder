import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Toggle } from '../Toggle';

interface Props {
  dark: boolean;
  onToggleDark: () => void;
  wallpaper: boolean;
  onToggleWallpaper: () => void;
  wallpaperDim: number;
  onSetWallpaperDim: (v: number) => void;
}

/**
 * Matcha's appearance popover: a header button that opens light/dark, the background photo switch and the
 * photo dim slider. It holds no state of its own beyond open/closed; every control calls the same handler App
 * already gives Settings (so the same `theme_pref`, `wallpaper_pref` and `wallpaper_dim` storage keys are
 * written by App's own effects). Esc and a click outside close it; focus goes back to the button.
 */
export function MatchaAppearance({ dark, onToggleDark, wallpaper, onToggleWallpaper, wallpaperDim, onSetWallpaperDim }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Move focus into the popover so it is keyboard reachable.
    panelRef.current?.querySelector<HTMLElement>('button, input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      // Outside click: leave focus on whatever was clicked; only rescue it if it would be lost.
      setOpen(false);
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) btnRef.current?.focus();
      });
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="Appearance"
        title="Appearance"
        className="btn-quiet inline-flex h-9 w-9 p-0"
      >
        <Icon.Palette className="h-4 w-4" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label="Appearance"
          className="mx-popover fixed left-4 right-4 top-20 z-50 flex flex-col gap-1 rounded-2xl border border-line bg-panel p-4 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-80"
        >
          <p className="mx-mono text-ink-faint">Appearance</p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-body text-ink">Dark mode</span>
            <Toggle on={dark} onChange={onToggleDark} label="Dark mode" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-body text-ink">Background photo</span>
            <Toggle on={wallpaper} onChange={onToggleWallpaper} label="Background photo" />
          </div>
          {wallpaper && (
            <div className="flex flex-col gap-1 pt-1">
              <label htmlFor={`${id}-dim`} className="text-meta text-ink-soft">
                Photo dim
              </label>
              <div className="flex items-center gap-3">
                <input
                  id={`${id}-dim`}
                  type="range"
                  min={0}
                  max={100}
                  value={wallpaperDim}
                  onChange={(e) => onSetWallpaperDim(Number(e.target.value))}
                  aria-label="Background photo dim"
                  className="h-11 w-full accent-accent"
                />
                <span className="w-10 shrink-0 text-right font-mono text-micro text-ink-soft">{wallpaperDim}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
