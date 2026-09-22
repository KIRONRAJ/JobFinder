import { useEffect, useState, useRef } from 'react';

interface Props {
  text: string;
  duration?: number; // ms, default 300
  scrambleSpeed?: number; // ms per glyph cycle, default 25
  className?: string;
  trigger?: any; // re-run animation whenever trigger changes
}

const GLYPHS = '!<>-_\\/[]{}—=+*^?#_0101';

export function ScrambleText({
  text,
  duration = 300,
  scrambleSpeed = 25,
  className = '',
  trigger,
}: Props) {
  const [displayText, setDisplayText] = useState(text);
  const isReducedMotion = useRef(false);

  useEffect(() => {
    isReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReducedMotion.current) {
      setDisplayText(text);
      return;
    }

    const length = text.length;
    const startTime = performance.now();
    let timer: number | null = null;

    const cycle = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Number of locked-in correct characters from left to right
      const lockedCount = Math.floor(progress * length);

      let scrambled = '';
      for (let i = 0; i < length; i++) {
        if (text[i] === ' ') {
          scrambled += ' ';
        } else if (i < lockedCount) {
          scrambled += text[i];
        } else {
          scrambled += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
      }

      setDisplayText(scrambled);

      if (progress < 1) {
        timer = window.setTimeout(cycle, scrambleSpeed);
      } else {
        setDisplayText(text);
      }
    };

    cycle();

    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [text, duration, scrambleSpeed, trigger]);

  return <span className={`inline-block font-mono ${className}`}>{displayText}</span>;
}
