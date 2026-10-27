import { useMatcha } from '../lib/useMatcha';

/** A plain on/off control. The app had no switch primitive — these toggles
 *  were sidebar buttons whose label changed — so this is the smallest thing
 *  that reads as a setting rather than an action. */
export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  const matcha = useMatcha();
  // Matcha: a 56x32 track inside a 44px-tall button, so the whole switch is a 44px target without looking bigger.
  if (matcha) {
    return (
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onChange}
        className="mx-switch flex h-11 min-w-[44px] items-center justify-center"
      >
        <span
          className={`relative block h-8 w-14 rounded-full border transition-colors duration-200 ${
            on ? 'border-accent bg-accent' : 'border-line bg-transparent'
          }`}
        >
          <span
            className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full transition-all duration-200 ${
              on ? 'left-[28px] bg-on-accent' : 'left-1 bg-ink-faint'
            }`}
          />
        </span>
      </button>
    );
  }
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 rounded-full border-2 transition-colors duration-200
                  ${on ? 'border-accent bg-accent/25' : 'border-line bg-panel-2'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full transition-all duration-200
                    ${on ? 'left-[22px] bg-accent' : 'left-0.5 bg-ink-faint'}`}
      />
    </button>
  );
}
