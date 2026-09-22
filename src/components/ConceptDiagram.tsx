import { useRef, useState } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';

/**
 * Interactive inline-SVG explainers for the Role Refreshers section.
 *
 * Deliberately narrow in scope: a diagram only exists here for a concept that
 * is *genuinely spatial* — layers, zones, chains, paths, lifecycles, address
 * maths. A diagram for something like "ITIL" or "stakeholder communication"
 * would be decoration standing in for an explanation, so those terms render
 * as plain expandable text instead and this registry simply has no entry.
 *
 * Shared rules, so eight diagrams read as one system:
 *  - Every diagram is one <svg>, no chart library, no external assets.
 *  - Colour comes from theme tokens via Tailwind `fill-*`/`stroke-*` classes,
 *    so light/dark and the themeable accent all follow automatically.
 *  - Every selectable part is a real <button> in a toolbar-role group, so the
 *    thing is keyboard-navigable rather than mouse-only eye candy.
 *  - Selection never relies on hue alone — the selected part also gains a
 *    heavier stroke and its label goes full-contrast, and the caption below
 *    names it in words.
 */

export type DiagramKey =
  | 'osi'
  | 'segmentation'
  | 'cia'
  | 'dns'
  | 'pki'
  | 'siem'
  | 'incident'
  | 'subnet';

/** Shell every diagram shares: framed surface, the SVG, then a caption that
 *  changes with the selection. The caption is the actual teaching surface —
 *  the picture is the index into it, not the explanation itself. */
function DiagramFrame({
  hint,
  caption,
  children,
}: {
  hint: string;
  caption: { title: string; body: string } | null;
  children: React.ReactNode;
}) {
  const captionRef = useRef<HTMLDivElement>(null);

  // No AnimatePresence in the original either — the old motion.div just
  // remounted on `key` change and played its entrance, no exit. Re-running
  // a `from()` on the persistent node whenever the caption changes is the
  // same effect without needing a remount at all.
  useGSAP(
    () => {
      if (!captionRef.current) return;
      const reduce = prefersReducedMotion();
      gsap.from(captionRef.current, { opacity: 0, y: 3, duration: reduce ? 0 : 0.16, ease: 'power2.out' });
    },
    { dependencies: [caption?.title] }
  );

  return (
    <div className="panel-inset overflow-hidden px-4 py-3.5">
      <p className="mb-3 flex items-center gap-1.5 section-label">
        <Icon.Sparkle className="h-3 w-3" />
        {hint}
      </p>
      <div className="overflow-x-auto">{children}</div>
      <div ref={captionRef} className="mt-3 min-h-[3.25rem] rounded-xl border border-line-soft bg-panel px-3 py-2.5">
        {caption ? (
          <>
            <p className="text-micro font-medium text-ink">{caption.title}</p>
            <p className="mt-0.5 text-micro leading-relaxed text-ink-soft">{caption.body}</p>
          </>
        ) : (
          <p className="text-micro text-ink-faint">Pick a part of the diagram to see what it does.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- OSI layers

const OSI_LAYERS: { n: number; name: string; body: string }[] = [
  {
    n: 7,
    name: 'Application',
    body: 'What the user actually touches — HTTP, DNS, SMTP. "The website is down" starts here, but the cause usually is not.',
  },
  {
    n: 6,
    name: 'Presentation',
    body: 'Encoding, compression, TLS encryption. A certificate error is a layer-6 story even though it shows up in a browser.',
  },
  {
    n: 5,
    name: 'Session',
    body: 'Sets up, maintains and tears down conversations between two hosts. Rarely the culprit; worth naming so the count is right.',
  },
  {
    n: 4,
    name: 'Transport',
    body: 'TCP and UDP — ports, handshakes, retransmits. "Port 443 is filtered" and "connection timed out" both live here.',
  },
  {
    n: 3,
    name: 'Network',
    body: 'IP addressing and routing between networks. Routers, subnets, default gateways. Your traceroute is a layer-3 tool.',
  },
  {
    n: 2,
    name: 'Data link',
    body: 'MAC addresses, switches, VLANs, ARP. Two devices on the same segment talking to each other directly.',
  },
  {
    n: 1,
    name: 'Physical',
    body: 'Cable, fibre, radio, the port itself. Check it first, not last — a huge share of real incidents end here.',
  },
];

function OsiDiagram() {
  const [sel, setSel] = useState<number | null>(3);
  const active = OSI_LAYERS.find((l) => l.n === sel) ?? null;

  return (
    <DiagramFrame
      hint="Click a layer — troubleshooting runs bottom-up"
      caption={active ? { title: `Layer ${active.n} — ${active.name}`, body: active.body } : null}
    >
      <div className="flex min-w-[260px] flex-col gap-1" role="group" aria-label="OSI model layers">
        {OSI_LAYERS.map((l) => {
          const on = sel === l.n;
          return (
            <button
              key={l.n}
              onClick={() => setSel(on ? null : l.n)}
              aria-pressed={on}
              className={`flex items-center gap-3 rounded-lg border px-3 py-1.5 text-left text-micro transition
                          focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                          ${
                            on
                              ? 'border-accent bg-accent/10 font-medium text-accent'
                              : 'border-line text-ink-soft hover:border-accent/50 hover:bg-panel-2 hover:text-ink'
                          }`}
              // Upper layers indent slightly so the stack reads as a stack
              // rather than a flat list of seven equal things.
              style={{ marginLeft: `${(7 - l.n) * 6}px` }}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-label
                            ${on ? 'bg-accent text-on-accent' : 'bg-panel-2 text-ink-faint'}`}
              >
                {l.n}
              </span>
              {l.name}
              {on && <Icon.Check className="ml-auto h-3 w-3" />}
            </button>
          );
        })}
      </div>
    </DiagramFrame>
  );
}

// -------------------------------------------------------- Network segmentation

const ZONES: { id: string; label: string; sub: string; body: string; x: number; tone: string }[] = [
  {
    id: 'corp',
    label: 'Corporate IT',
    sub: 'laptops, email, HR',
    x: 8,
    tone: 'accent',
    body: 'Ordinary business network. Highest change rate, most users, most phishing exposure — and therefore the least trusted side of the boundary.',
  },
  {
    id: 'dmz',
    label: 'DMZ',
    sub: 'jump hosts, historians',
    x: 178,
    tone: 'amber',
    body: 'The controlled meeting point. Nothing crosses corporate-to-OT directly; traffic terminates here and is re-originated, so a compromised laptop cannot reach a controller in one hop.',
  },
  {
    id: 'ot',
    label: 'OT / control',
    sub: 'SCADA, PLCs, RTUs',
    x: 348,
    tone: 'grass',
    body: 'Runs the physical process. Devices live for decades, patch windows are rare, and downtime has safety consequences — so the answer is isolation, not "install the agent".',
  },
];

const ZONE_FILL: Record<string, string> = {
  accent: 'fill-accent/10 stroke-accent',
  amber: 'fill-amber/10 stroke-amber',
  grass: 'fill-grass/10 stroke-grass',
};

function SegmentationDiagram() {
  const [sel, setSel] = useState<string | null>('dmz');
  const active = ZONES.find((z) => z.id === sel) ?? null;

  return (
    <DiagramFrame
      hint="Click a zone — why a grid operator's network is not a corporate one"
      caption={active ? { title: active.label, body: active.body } : null}
    >
      <svg viewBox="0 0 500 130" className="h-auto w-full min-w-[440px]" role="group" aria-label="Network segmentation zones">
        {/* Firewalls between the three zones. Drawn first so zone borders sit
            on top of the connector lines rather than under them. */}
        {[150, 320].map((x) => (
          <g key={x}>
            <line x1={x - 8} y1="58" x2={x + 36} y2="58" className="stroke-line" strokeWidth="2" />
            <rect
              x={x + 2}
              y="44"
              width="24"
              height="28"
              rx="5"
              className="fill-panel stroke-rose"
              strokeWidth="1.5"
            />
            <path
              d={`M${x + 8} 52 h12 M${x + 8} 58 h12 M${x + 8} 64 h12`}
              className="stroke-rose"
              strokeWidth="1.2"
            />
            <text x={x + 14} y="88" textAnchor="middle" className="fill-ink-faint text-[8px]">
              firewall
            </text>
          </g>
        ))}

        {ZONES.map((z) => {
          const on = sel === z.id;
          return (
            <g
              key={z.id}
              onClick={() => setSel(on ? null : z.id)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={z.label}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSel(on ? null : z.id);
                }
              }}
            >
              <rect
                x={z.x}
                y="26"
                width="142"
                height="64"
                rx="10"
                className={ZONE_FILL[z.tone]}
                strokeWidth={on ? 2.5 : 1.2}
                opacity={sel && !on ? 0.45 : 1}
              />
              <text
                x={z.x + 71}
                y="52"
                textAnchor="middle"
                className={on ? 'fill-ink text-[11px] font-semibold' : 'fill-ink-soft text-[11px]'}
              >
                {z.label}
              </text>
              <text x={z.x + 71} y="68" textAnchor="middle" className="fill-ink-faint text-[8px]">
                {z.sub}
              </text>
              {on && (
                <circle cx={z.x + 132} cy="36" r="3.5" className="fill-accent" />
              )}
            </g>
          );
        })}

        <text x="250" y="116" textAnchor="middle" className="fill-ink-faint text-[8px]">
          trust decreases left to right — traffic never crosses two boundaries in one hop
        </text>
      </svg>
    </DiagramFrame>
  );
}

// ------------------------------------------------------------------ CIA triad

/** Vertex position and label position are stored separately rather than
 *  derived from each other — the label sits outside the triangle and its text
 *  anchor differs per corner, so one pair of coordinates cannot serve both. */
const CIA: {
  id: string;
  label: string;
  body: string;
  cx: number;
  cy: number;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'middle' | 'end';
}[] = [
  {
    id: 'c',
    label: 'Confidentiality',
    body: 'Only the right people can read it. Encryption, access control, least privilege. Broken by a data leak.',
    cx: 150,
    cy: 34,
    labelX: 150,
    labelY: 18,
    anchor: 'middle',
  },
  {
    id: 'i',
    label: 'Integrity',
    body: 'The data is what it claims to be and has not been altered. Hashing, signing, change control. Broken by tampering — often worse than a leak in a control system.',
    cx: 62,
    cy: 102,
    labelX: 44,
    labelY: 124,
    anchor: 'start',
  },
  {
    id: 'a',
    label: 'Availability',
    body: 'It is there when it is needed. Redundancy, backups, DDoS protection. In critical infrastructure this often outranks the other two.',
    cx: 238,
    cy: 102,
    labelX: 256,
    labelY: 124,
    anchor: 'end',
  },
];

function CiaDiagram() {
  const [sel, setSel] = useState<string | null>(null);
  const active = CIA.find((c) => c.id === sel) ?? null;

  return (
    <DiagramFrame
      hint="Click a corner — every security decision trades these three off"
      caption={
        active
          ? { title: active.label, body: active.body }
          : {
              title: 'The trade-off is the point',
              body: 'Pushing one corner usually costs another: full-disk encryption helps confidentiality and can hurt availability if the recovery key is lost. Naming which corner a control serves is the answer interviewers want.',
            }
      }
    >
      <svg viewBox="0 0 300 140" className="h-auto w-full min-w-[280px]" role="group" aria-label="CIA triad">
        <polygon
          points="150,34 62,102 238,102"
          className="fill-accent/[0.07] stroke-line"
          strokeWidth="1.5"
        />
        {CIA.map((c) => {
          const on = sel === c.id;
          return (
            <g
              key={c.id}
              onClick={() => setSel(on ? null : c.id)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={c.label}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSel(on ? null : c.id);
                }
              }}
            >
              <circle
                cx={c.cx}
                cy={c.cy}
                r={on ? 11 : 8}
                className={on ? 'fill-accent stroke-accent' : 'fill-panel stroke-line'}
                strokeWidth="2"
              />
              {on && (
                <path
                  d={`M${c.cx - 4} ${c.cy} l3 3 l5 -6`}
                  className="stroke-on-accent"
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <text
                x={c.labelX}
                y={c.labelY}
                textAnchor={c.anchor}
                className={on ? 'fill-ink text-[11px] font-semibold' : 'fill-ink-soft text-[11px]'}
              >
                {c.label}
              </text>
            </g>
          );
        })}
      </svg>
    </DiagramFrame>
  );
}

// ------------------------------------------------------------- DNS resolution

const DNS_HOPS = [
  { label: 'Your PC', body: 'Checks its own cache and hosts file first. A stale entry here explains a surprising number of "it works on my machine" tickets.' },
  { label: 'Resolver', body: 'The recursive resolver (your ISP, or 8.8.8.8). It does the legwork and caches the answer for the TTL. `ipconfig /flushdns` clears the client side, not this.' },
  { label: 'Root / TLD', body: 'Root servers point at the .nz TLD servers, which point at the domain\'s authoritative nameservers. Two referrals, no actual answer yet.' },
  { label: 'Authoritative', body: 'The nameserver that actually holds the zone file. This is the only box that knows the real record — everything else is a cache of it.' },
  { label: 'Answer', body: 'The A/AAAA record comes back and is cached at every level on the way. Troubleshooting order: cache → resolver reachability → record correctness.' },
];

function DnsDiagram() {
  const [step, setStep] = useState(0);

  return (
    <DiagramFrame
      hint="Step through a lookup — where a DNS problem actually lives"
      caption={{ title: DNS_HOPS[step].label, body: DNS_HOPS[step].body }}
    >
      <div className="min-w-[420px]">
        <svg viewBox="0 0 460 66" className="h-auto w-full" role="img" aria-label="DNS resolution path">
          {DNS_HOPS.map((h, i) => {
            const cx = 40 + i * 96;
            const reached = i <= step;
            return (
              <g key={h.label}>
                {i > 0 && (
                  <>
                    <line
                      x1={cx - 78}
                      y1="26"
                      x2={cx - 22}
                      y2="26"
                      className={reached ? 'stroke-accent' : 'stroke-line'}
                      strokeWidth="2"
                      strokeDasharray={reached ? '0' : '3 3'}
                    />
                    <path
                      d={`M${cx - 28} 22 l6 4 l-6 4`}
                      className={reached ? 'stroke-accent' : 'stroke-line'}
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}
                <circle
                  cx={cx}
                  cy="26"
                  r="15"
                  className={
                    i === step
                      ? 'fill-accent stroke-accent'
                      : reached
                        ? 'fill-accent/15 stroke-accent'
                        : 'fill-panel stroke-line'
                  }
                  strokeWidth="2"
                />
                <text
                  x={cx}
                  y="30"
                  textAnchor="middle"
                  className={i === step ? 'fill-on-accent text-[10px] font-semibold' : 'fill-ink-soft text-[10px]'}
                >
                  {i + 1}
                </text>
                <text
                  x={cx}
                  y="56"
                  textAnchor="middle"
                  className={i === step ? 'fill-ink text-[8.5px] font-semibold' : 'fill-ink-faint text-[8.5px]'}
                >
                  {h.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn-ghost disabled:opacity-40"
          >
            Back
          </button>
          <button
            onClick={() => setStep((s) => Math.min(DNS_HOPS.length - 1, s + 1))}
            disabled={step === DNS_HOPS.length - 1}
            className="btn-ghost disabled:opacity-40"
          >
            Next hop
            <Icon.Arrow className="h-3 w-3" />
          </button>
          <button onClick={() => setStep(0)} className="link-quiet ml-auto text-micro">
            Reset
          </button>
        </div>
      </div>
    </DiagramFrame>
  );
}

// ------------------------------------------------------------------ PKI chain

const PKI_NODES = [
  {
    id: 'root',
    label: 'Root CA',
    body: 'Self-signed, offline, and already trusted by the operating system. If a root is compromised every certificate beneath it is worthless — which is why it lives in a safe, not on a server.',
  },
  {
    id: 'inter',
    label: 'Intermediate CA',
    body: 'Signed by the root, and the thing that actually issues certificates day to day. Exists so the root can stay offline and so a breach can be contained by revoking one intermediate.',
  },
  {
    id: 'leaf',
    label: 'Server cert',
    body: 'The certificate the website presents. Binds a public key to a hostname, with an expiry date. "Certificate not trusted" almost always means a missing intermediate, not a bad leaf.',
  },
];

function PkiDiagram() {
  const [sel, setSel] = useState<string | null>('inter');
  const active = PKI_NODES.find((n) => n.id === sel) ?? null;

  return (
    <DiagramFrame
      hint="Click a link in the chain — trust flows downward, verification upward"
      caption={
        active
          ? { title: active.label, body: active.body }
          : {
              title: 'Chain of trust',
              body: 'Your browser walks the chain upward until it reaches a certificate it already trusts. Break any link and the whole chain fails.',
            }
      }
    >
      <svg viewBox="0 0 300 168" className="h-auto w-full min-w-[280px]" role="group" aria-label="Certificate chain of trust">
        {PKI_NODES.map((n, i) => {
          const y = 20 + i * 56;
          const on = sel === n.id;
          return (
            <g key={n.id}>
              {i > 0 && (
                <>
                  <line x1="150" y1={y - 22} x2="150" y2={y - 2} className="stroke-line" strokeWidth="2" />
                  <text x="160" y={y - 8} className="fill-ink-faint text-[7.5px]">
                    signs
                  </text>
                </>
              )}
              <g
                onClick={() => setSel(on ? null : n.id)}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={n.label}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSel(on ? null : n.id);
                  }
                }}
              >
                <rect
                  x="78"
                  y={y}
                  width="144"
                  height="36"
                  rx="8"
                  className={on ? 'fill-accent/12 stroke-accent' : 'fill-panel stroke-line'}
                  strokeWidth={on ? 2.5 : 1.4}
                />
                <rect
                  x="90"
                  y={y + 11}
                  width="11"
                  height="14"
                  rx="2"
                  className={on ? 'fill-accent' : 'fill-ink-faint'}
                />
                <text
                  x="112"
                  y={y + 23}
                  className={on ? 'fill-ink text-[11px] font-semibold' : 'fill-ink-soft text-[11px]'}
                >
                  {n.label}
                </text>
              </g>
            </g>
          );
        })}
        <text x="150" y="164" textAnchor="middle" className="fill-ink-faint text-[8px]">
          browser verifies leaf → intermediate → root, stopping at the first trusted one
        </text>
      </svg>
    </DiagramFrame>
  );
}

// --------------------------------------------------------------- SIEM pipeline

const SIEM_STAGES = [
  { label: 'Log sources', body: 'Firewalls, servers, endpoints, cloud. Garbage in, garbage out — if a source is not onboarded, the SIEM is blind to it no matter how good the rules are.' },
  { label: 'Collect & normalise', body: 'Parse wildly different log formats into common fields (src_ip, user, action). This unglamorous step is where most SIEM projects actually succeed or fail.' },
  { label: 'Correlate', body: 'Rules and analytics across sources: a failed VPN login is noise; 200 of them followed by one success from a new country is a detection.' },
  { label: 'Alert', body: 'A correlation fires and becomes a case with a severity. Tuning lives here — an alert nobody can action is worse than no alert at all.' },
  { label: 'Triage', body: 'A human decides: true positive, false positive, or benign true positive. This is the actual day job of a SOC analyst, and what the interview will probe.' },
];

function SiemDiagram() {
  const [sel, setSel] = useState(2);

  return (
    <DiagramFrame
      hint="Click a stage — the path a log line takes to become an incident"
      caption={{ title: SIEM_STAGES[sel].label, body: SIEM_STAGES[sel].body }}
    >
      <div
        className="flex min-w-[440px] items-stretch gap-1"
        role="group"
        aria-label="SIEM pipeline stages"
      >
        {SIEM_STAGES.map((s, i) => {
          const on = sel === i;
          return (
            <button
              key={s.label}
              onClick={() => setSel(i)}
              aria-pressed={on}
              className={`relative flex-1 rounded-lg border px-2 py-3 text-center text-[10px] leading-tight transition
                          focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                          ${
                            on
                              ? 'border-accent bg-accent/10 font-semibold text-accent'
                              : 'border-line text-ink-soft hover:border-accent/50 hover:bg-panel-2 hover:text-ink'
                          }`}
            >
              <span
                className={`mx-auto mb-1.5 flex h-5 w-5 items-center justify-center rounded-full font-mono text-[9px]
                            ${on ? 'bg-accent text-on-accent' : 'bg-panel-2 text-ink-faint'}`}
              >
                {i + 1}
              </span>
              {s.label}
              {/* Funnel cue: each stage is visually narrower than the last, so
                  the volume drop from millions of logs to a handful of cases
                  is legible without a second chart. */}
              <span
                className="absolute inset-x-2 bottom-1 h-[3px] rounded-full bg-accent/30"
                style={{ opacity: 1 - i * 0.17 }}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[10px] text-ink-faint">
        millions of events → a few dozen alerts → a handful worth a human
      </p>
    </DiagramFrame>
  );
}

// ------------------------------------------------------- Incident response ring

const IR_PHASES = [
  { label: 'Prepare', body: 'Runbooks, contact lists, logging turned on before you need it. The phase everyone skips and every post-incident review blames.' },
  { label: 'Identify', body: 'Confirm something real is happening and scope it. "Is this an incident or a misconfiguration?" — answer before escalating.' },
  { label: 'Contain', body: 'Stop the spread without destroying evidence. Isolate the host, disable the account. Short-term containment first, then a considered long-term fix.' },
  { label: 'Eradicate', body: 'Remove the cause — malware, the persistence mechanism, the exposed credential. Containment without eradication just delays round two.' },
  { label: 'Recover', body: 'Restore service and watch closely for reinfection. Restoring from a backup taken after the compromise is the classic own goal.' },
  { label: 'Lessons', body: 'Blameless review that changes something concrete. If no control, log source or runbook changed, the loop did not close.' },
];

function IncidentDiagram() {
  const [sel, setSel] = useState(2);
  const R = 52;
  const cx = 84;
  const cy = 84;

  return (
    <DiagramFrame
      hint="Click a phase — the loop closes, it does not end"
      caption={{ title: `${sel + 1}. ${IR_PHASES[sel].label}`, body: IR_PHASES[sel].body }}
    >
      <div className="flex min-w-[300px] flex-wrap items-center gap-4">
        <svg viewBox="0 0 168 168" className="h-[168px] w-[168px] shrink-0" role="group" aria-label="Incident response lifecycle">
          <circle cx={cx} cy={cy} r={R} className="fill-none stroke-line" strokeWidth="1.5" strokeDasharray="4 4" />
          {IR_PHASES.map((p, i) => {
            // Start at 12 o'clock and run clockwise, so the ring reads the way
            // a clock does rather than the way atan2 happens to.
            const angle = (i / IR_PHASES.length) * Math.PI * 2 - Math.PI / 2;
            const x = cx + R * Math.cos(angle);
            const y = cy + R * Math.sin(angle);
            const on = sel === i;
            return (
              <g
                key={p.label}
                onClick={() => setSel(i)}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={p.label}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSel(i);
                  }
                }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={on ? 15 : 12}
                  className={on ? 'fill-accent stroke-accent' : 'fill-panel stroke-line'}
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={y + 3.5}
                  textAnchor="middle"
                  className={on ? 'fill-on-accent text-[10px] font-bold' : 'fill-ink-soft text-[10px]'}
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
          <text x={cx} y={cy - 3} textAnchor="middle" className="fill-ink-faint text-[8px]">
            incident
          </text>
          <text x={cx} y={cy + 7} textAnchor="middle" className="fill-ink-faint text-[8px]">
            lifecycle
          </text>
        </svg>

        <ul className="min-w-[130px] flex-1 space-y-0.5">
          {IR_PHASES.map((p, i) => (
            <li key={p.label}>
              <button
                onClick={() => setSel(i)}
                aria-pressed={sel === i}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-micro transition
                            ${sel === i ? 'bg-accent/10 font-medium text-accent' : 'text-ink-soft hover:bg-panel-2 hover:text-ink'}`}
              >
                <span className="font-mono text-label text-ink-faint">{i + 1}</span>
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </DiagramFrame>
  );
}

// ----------------------------------------------------------------- Subnetting

/** The one diagram that computes rather than just labels — a slider over the
 *  prefix length, showing the host maths update live. Reading the numbers
 *  move is what makes /26 vs /24 stick. */
function SubnetDiagram() {
  const [prefix, setPrefix] = useState(24);
  const hostBits = 32 - prefix;
  const total = Math.pow(2, hostBits);
  const usable = Math.max(0, total - 2);
  const octets = [8, 16, 24, 32];

  return (
    <DiagramFrame
      hint="Drag the slider — watch the network/host split move"
      caption={{
        title: `192.168.1.0/${prefix}`,
        body:
          `${prefix} network bits, ${hostBits} host bits → ${total.toLocaleString()} addresses, ` +
          `${usable.toLocaleString()} usable (network and broadcast are never assigned). ` +
          (prefix === 31
            ? 'The /31 is the point-to-point exception — 2 addresses, both usable, no broadcast.'
            : prefix >= 30
              ? 'A /30 is the classic point-to-point link: 4 addresses, 2 usable.'
              : 'Subnet mask: ' + maskFor(prefix)),
      }}
    >
      <div className="min-w-[300px]">
        {/* 32 bit cells, coloured by whether they are network or host bits. */}
        <div className="flex gap-[2px]" role="img" aria-label={`${prefix} network bits of 32`}>
          {Array.from({ length: 32 }, (_, i) => (
            <span
              key={i}
              className={`h-6 flex-1 rounded-[2px] transition-colors ${
                i < prefix ? 'bg-accent' : 'bg-line'
              } ${octets.includes(i + 1) && i !== 31 ? 'mr-[3px]' : ''}`}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-ink-faint">
          <span>← network ({prefix})</span>
          <span>host ({hostBits}) →</span>
        </div>

        <input
          type="range"
          min={8}
          max={31}
          value={prefix}
          onChange={(e) => setPrefix(Number(e.target.value))}
          aria-label="Prefix length"
          className="mt-3 w-full accent-accent"
        />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {[8, 16, 24, 26, 30].map((p) => (
            <button
              key={p}
              onClick={() => setPrefix(p)}
              aria-pressed={prefix === p}
              className={`rounded-full border px-2.5 py-[3px] font-mono text-label transition
                          ${
                            prefix === p
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-line text-ink-soft hover:border-accent/50 hover:text-ink'
                          }`}
            >
              /{p}
            </button>
          ))}
        </div>
      </div>
    </DiagramFrame>
  );
}

function maskFor(prefix: number): string {
  return Array.from({ length: 4 }, (_, i) => {
    const bits = Math.max(0, Math.min(8, prefix - i * 8));
    return 256 - Math.pow(2, 8 - bits);
  }).join('.');
}

// ------------------------------------------------------------------- registry

const DIAGRAMS: Record<DiagramKey, () => JSX.Element> = {
  osi: OsiDiagram,
  segmentation: SegmentationDiagram,
  cia: CiaDiagram,
  dns: DnsDiagram,
  pki: PkiDiagram,
  siem: SiemDiagram,
  incident: IncidentDiagram,
  subnet: SubnetDiagram,
};

export function hasDiagram(key: string | undefined): key is DiagramKey {
  return Boolean(key && key in DIAGRAMS);
}

export function ConceptDiagram({ diagram }: { diagram: DiagramKey }) {
  const Component = DIAGRAMS[diagram];
  return <Component />;
}
