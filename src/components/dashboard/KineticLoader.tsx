import { useState, useEffect, useRef } from 'react';
import { gsap } from '../../lib/gsapSetup';

interface Props {
  onComplete?: () => void;
  forceShow?: boolean;
}

export function KineticLoader({ onComplete, forceShow }: Props) {
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'completing' | 'done'>('loading');
  const overlayRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<SVGSVGElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Check session storage if not forced
    if (!forceShow && typeof window !== 'undefined') {
      const seen = sessionStorage.getItem('jhq_preloader_seen');
      if (seen) {
        setPhase('done');
        onComplete?.();
        return;
      }
    }

    let current = 0;
    const startTime = Date.now();
    const duration = 1100; // ~1.1s snappy, satisfying load

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Spring non-linear curve: fast start, slight suspense around 85%, quick snap to 100
      const eased = progress < 0.7 
        ? Math.pow(progress / 0.7, 1.2) * 0.75
        : 0.75 + Math.pow((progress - 0.7) / 0.3, 2) * 0.25;
      
      current = Math.min(Math.round(eased * 100), 100);
      setCount(current);

      if (progress >= 1) {
        clearInterval(interval);
        setCount(100);
        setPhase('completing');

        if (typeof window !== 'undefined') {
          sessionStorage.setItem('jhq_preloader_seen', 'true');
        }

        // Kinetic curtain exit animation using smooth cubic-bezier
        if (overlayRef.current) {
          gsap.to(overlayRef.current, {
            yPercent: -100,
            duration: 0.65,
            ease: 'power4.inOut',
            onComplete: () => {
              setPhase('done');
              onComplete?.();
            },
          });
        } else {
          setPhase('done');
          onComplete?.();
        }
      }
    }, 20);

    return () => clearInterval(interval);
  }, [forceShow, onComplete]);

  // Gentle floating oscillation on the impossible geometric mark
  useEffect(() => {
    if (!markRef.current || phase === 'done') return;
    gsap.to(markRef.current, {
      rotate: 360,
      duration: 18,
      repeat: -1,
      ease: 'none',
    });
  }, [phase]);

  if (phase === 'done') return null;

  const statusText =
    count < 30
      ? 'INITIALIZING COCKPIT'
      : count < 65
      ? 'CONNECTING NODE:5178'
      : count < 90
      ? 'SYNCING PURSUITS'
      : 'COCKPIT READY';

  return (
    <div
      ref={overlayRef}
      role="presentation"
      onClick={() => {
        // Quick bypass on click
        setPhase('done');
        onComplete?.();
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#0b0c10] text-[#f4f4f6] px-8 py-10 select-none cursor-pointer overflow-hidden font-sans"
    >
      {/* Fine noise texture */}
      <div className="grain-overlay pointer-events-none opacity-[0.04]" />

      {/* Top Telemetry Header */}
      <div className="w-full flex items-center justify-between text-xs tracking-widest uppercase font-mono text-white/50">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
          <span className="text-white/80 font-bold">JobSearch HQ · Studio</span>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          <span>Production Node</span>
          <span className="text-emerald-400 font-semibold">● ONLINE</span>
        </div>
        <span className="text-white/40 text-[10px] tracking-normal hover:text-white/70 transition-colors">
          Click or press Esc to skip
        </span>
      </div>

      {/* Centerpiece: Impossible Isometric Geometric Mark & Tabular Digits */}
      <div className="flex flex-col items-center justify-center my-auto relative">
        <div className="relative flex items-center justify-center">
          {/* Ambient Glow */}
          <div className="absolute h-56 w-56 rounded-full bg-blue-600/15 blur-3xl pointer-events-none" />
          <div className="absolute h-40 w-40 rounded-full bg-fuchsia-600/15 blur-2xl pointer-events-none" />

          {/* Geometric Impossible Cubes Mark (Inspired by kott.studio) */}
          <svg
            ref={markRef}
            className="h-28 w-28 sm:h-36 sm:w-36 drop-shadow-[0_0_25px_rgba(0,55,255,0.45)]"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Outer Hex Prism Segments */}
            <path
              d="M50 5 L89 27.5 V72.5 L50 95 L11 72.5 V27.5 Z"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1.5"
            />
            {/* Top Cube Isometric Face */}
            <polygon
              points="50,15 75,29.5 50,44 25,29.5"
              fill="url(#topGrad)"
              stroke="#0037ff"
              strokeWidth="1"
            />
            {/* Left Cube Isometric Face */}
            <polygon
              points="25,29.5 50,44 50,73 25,58.5"
              fill="url(#leftGrad)"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
            />
            {/* Right Cube Isometric Face */}
            <polygon
              points="50,44 75,29.5 75,58.5 50,73"
              fill="url(#rightGrad)"
              stroke="#ff007a"
              strokeWidth="1"
            />
            {/* Inner Core Prism */}
            <circle cx="50" cy="44" r="4.5" fill="#ffffff" className="animate-pulse" />

            <defs>
              <linearGradient id="topGrad" x1="25" y1="15" x2="75" y2="44" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0037ff" />
                <stop offset="1" stopColor="#6366f1" />
              </linearGradient>
              <linearGradient id="leftGrad" x1="25" y1="30" x2="50" y2="73" gradientUnits="userSpaceOnUse">
                <stop stopColor="#1e1e24" />
                <stop offset="1" stopColor="#0f1015" />
              </linearGradient>
              <linearGradient id="rightGrad" x1="50" y1="30" x2="75" y2="73" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ff007a" />
                <stop offset="1" stopColor="#7928ca" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* High-Precision JetBrains Mono Digital Counter */}
        <div className="mt-8 flex items-baseline justify-center gap-1 font-mono">
          <span
            ref={counterRef}
            className="text-6xl sm:text-7xl font-bold tracking-tighter text-white tabular-nums"
          >
            {String(count).padStart(3, '0')}
          </span>
          <span className="text-xl font-medium text-blue-400">%</span>
        </div>

        {/* Status Line */}
        <div className="mt-3 text-xs tracking-widest text-white/60 font-mono flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span>{statusText}</span>
        </div>
      </div>

      {/* Bottom Progress Pill Bar */}
      <div className="w-full max-w-md flex flex-col items-center gap-3">
        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden p-0.5">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-fuchsia-500 rounded-full transition-all duration-75 ease-out"
            style={{ width: `${count}%` }}
          />
        </div>
        <div className="w-full flex items-center justify-between text-[11px] font-mono text-white/40">
          <span>v6.1.0 · AESTHETIC STUDIO</span>
          <span>AUCKLAND · PACIFIC</span>
        </div>
      </div>
    </div>
  );
}
