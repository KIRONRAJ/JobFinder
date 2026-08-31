import { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import type { Application, View } from '../types';
import { Icon } from './Icons';
import { StatusIcon } from './Badges';
import { VIEW_META } from './Sidebar';
import { resolveEvidenceMap } from '../lib/evidenceState';
import { playSound } from '../lib/sound';

interface Props {
  apps: Application[];
  view: View;
  dark: boolean;
  visualTheme: 'bauhaus' | 'pulse';
  onSetView: (view: View) => void;
  onToggleTheme: () => void;
  onToggleVisualTheme: () => void;
  onAddNew: () => void;
  onOpenTerminal: () => void;
  onExportCsv: () => void;
}

const itemClass =
  'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-body text-ink ' +
  'data-[selected=true]:bg-panel-2';

const groupClass =
  'px-1 pb-1 pt-3 text-label font-medium uppercase tracking-wider text-ink-faint ' +
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5';

/** A section jump for one role — only offered for sections that would
 *  actually render on `/role/:id` for that entry, mirroring the same
 *  conditions RoleDetail.tsx uses to decide what to show. */
interface SectionJump {
  appId: string;
  hash: string;
  label: string;
  role: string;
  company: string;
}

export function CommandPalette({
  apps,
  view,
  dark,
  visualTheme,
  onSetView,
  onToggleTheme,
  onToggleVisualTheme,
  onAddNew,
  onOpenTerminal,
  onExportCsv,
}: Props) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Quiet UI-chrome tick, open only — a matching close tick reads as
  // redundant when the close is almost always immediately followed by
  // whatever the picked command itself does (navigate, open a modal, toast).
  useEffect(() => {
    if (open) playSound('tick');
  }, [open]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  // Same conditions RoleDetail.tsx uses to decide which sections render —
  // kept in sync by being this literal, not re-derived independently.
  const sectionJumps = useMemo(() => {
    const jumps: SectionJump[] = [];
    for (const a of apps) {
      if (a.analysis) {
        jumps.push({ appId: a.id, hash: 'fit', label: 'Fit & ATS', role: a.role, company: a.company });
      }
      if (Object.keys(resolveEvidenceMap(a)).length > 0) {
        jumps.push({ appId: a.id, hash: 'evidence', label: 'Evidence', role: a.role, company: a.company });
      }
      if (a.status === 'interview') {
        jumps.push({ appId: a.id, hash: 'interview', label: 'Interview', role: a.role, company: a.company });
      }
      if (a.status === 'rejected') {
        jumps.push({ appId: a.id, hash: 'rejection', label: 'Rejection', role: a.role, company: a.company });
      }
    }
    return jumps;
  }, [apps]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed left-1/2 top-[14%] z-[80] w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden
                 rounded-3xl border border-line bg-panel shadow-float"
    >
      <div className="flex items-center gap-3 border-b border-line px-5">
        <Icon.Search className="h-4 w-4 shrink-0 text-ink-faint" />
        <Command.Input
          placeholder="Search roles, or run a command…"
          className="w-full bg-transparent py-4 text-subhead text-ink outline-none placeholder:text-ink-faint"
        />
      </div>

      <Command.List className="max-h-[58vh] overflow-y-auto p-2.5">
        <Command.Empty className="py-10 text-center text-meta text-ink-faint">
          No matches.
        </Command.Empty>

        <Command.Group heading="Actions" className={groupClass}>
          <Command.Item onSelect={() => run(onOpenTerminal)} className={itemClass}>
            <Icon.Terminal className="h-4 w-4 text-accent" />
            New terminal — ask Claude anything jobhq-related
            <span className="ml-auto font-mono text-label text-ink-faint">Ctrl J</span>
          </Command.Item>
          <Command.Item onSelect={() => run(onAddNew)} className={itemClass}>
            <Icon.Plus className="h-4 w-4 text-accent" />
            Add application manually
          </Command.Item>
          <Command.Item onSelect={() => run(onExportCsv)} className={itemClass}>
            <Icon.Download className="h-4 w-4 text-accent" />
            Export everything to CSV
          </Command.Item>
          <Command.Item onSelect={() => run(onToggleTheme)} className={itemClass}>
            {dark ? (
              <Icon.Sun className="h-4 w-4 text-accent" />
            ) : (
              <Icon.Moon className="h-4 w-4 text-accent" />
            )}
            Switch to {dark ? 'light' : 'dark'} theme
          </Command.Item>
          <Command.Item onSelect={() => run(onToggleVisualTheme)} className={itemClass}>
            {visualTheme === 'pulse' ? (
              <Icon.Square className="h-4 w-4 text-accent" />
            ) : (
              <Icon.Sparkle className="h-4 w-4 text-accent" />
            )}
            Switch to {visualTheme === 'pulse' ? 'Bauhaus' : 'Pulse'} visual theme
          </Command.Item>
          {/* Driven off the same array the sidebar renders, so the palette can
              never again drift behind the set of views that actually exist. */}
          {VIEW_META.filter((v) => v.key !== view).map(({ key, label, icon: IconEl }) => (
            <Command.Item
              key={key}
              value={`Go to ${label}`}
              onSelect={() => run(() => onSetView(key))}
              className={itemClass}
            >
              <IconEl className="h-4 w-4 text-accent" />
              Go to {label}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Applications" className={groupClass}>
          {apps.map((a) => (
            <Command.Item
              key={a.id}
              value={`${a.company} ${a.role}`}
              onSelect={() => run(() => navigate(`/role/${a.id}`))}
              className={itemClass}
            >
              <StatusIcon status={a.status} />
              <span className="min-w-0 truncate">
                <span className="font-medium">{a.role}</span>
                <span className="text-ink-soft"> · {a.company}</span>
              </span>
            </Command.Item>
          ))}
        </Command.Group>

        {/* Only surfaced by search — jumping straight to a role's Evidence or
            Interview section from anywhere, without a nav item for each. */}
        <Command.Group heading="Jump to section" className={groupClass}>
          {sectionJumps.map((j) => (
            <Command.Item
              key={`${j.appId}-${j.hash}`}
              value={`${j.label} ${j.role} ${j.company}`}
              onSelect={() => run(() => navigate(`/role/${j.appId}#${j.hash}`))}
              className={itemClass}
            >
              <Icon.Arrow className="h-4 w-4 text-accent" />
              <span className="min-w-0 truncate">
                <span className="font-medium">{j.label}</span>
                <span className="text-ink-soft">
                  {' '}
                  — {j.role} · {j.company}
                </span>
              </span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
