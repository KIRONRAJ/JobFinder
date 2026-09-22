import { useEffect, useState, useRef } from 'react';

interface Props {
  value: number;
  duration?: number; // ms, default 700
  prefix?: string;
  suffix?: string;
  className?: string;
  formatter?: (val: number) => string;
}

export function AnimatedCounter({
  value,
  duration = 700,
  prefix = '',
  suffix = '',
  className = '',
  formatter,
}: Props) {
  const [displayValue, setDisplayValue] = useState<number>(() => {
    // If reduced motion is preferred, initialize directly with target value
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return value;
    }
    return 0;
  });

  const prevValue = useRef(0);

  useEffect(() => {
    // Check if user prefers reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayValue(value);
      prevValue.current = value;
      return;
    }

    const startVal = prevValue.current;
    const endVal = value;
    if (startVal === endVal) return;

    const startTime = performance.now();

    const updateCounter = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic: 1 - pow(1 - progress, 3)
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * easeProgress);

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        prevValue.current = endVal;
      }
    };

    const rafId = requestAnimationFrame(updateCounter);
    return () => cancelAnimationFrame(rafId);
  }, [value, duration]);

  const formatted = formatter ? formatter(displayValue) : displayValue.toLocaleString();

  return (
    <span className={`inline-block tabular-nums font-mono transition-colors ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
