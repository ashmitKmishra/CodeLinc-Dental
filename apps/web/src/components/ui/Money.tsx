import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

/** Dollar amount that counts to its new value when it changes. Respects reduced motion. */
export function Money({ cents, className }: { cents: number | null; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(cents);
  const prev = useRef(cents);
  useEffect(() => {
    if (cents == null || prev.current == null || reduce || prev.current === cents) { setShown(cents); prev.current = cents; return; }
    const c = animate(prev.current, cents, { duration: 0.6, ease: [0.2, 0, 0, 1], onUpdate: (v) => setShown(Math.round(v)) });
    prev.current = cents;
    return () => c.stop();
  }, [cents, reduce]);
  return <span className={cn('tnum', className)}>{money(shown)}</span>;
}
