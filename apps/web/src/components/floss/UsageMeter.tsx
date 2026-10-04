import { motion } from 'motion/react';
import { cn } from '@/lib/cn';

/** Actual usage as a solid fill. Fills in once on mount and when the value changes. */
export function UsageMeter({ used, max, label, className }: { used: number; max: number | null; label: string; className?: string }) {
  const pct = max == null || max <= 0 ? 0 : Math.min(1, used / max);
  return (
    <div
      role={max == null ? undefined : 'meter'} aria-label={label} aria-valuemin={0} aria-valuemax={max ?? undefined} aria-valuenow={max == null ? undefined : used}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <motion.div
        className="h-full origin-left rounded-full bg-actual"
        initial={{ scaleX: 0 }} animate={{ scaleX: max == null ? 0 : pct }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        style={{ width: '100%' }}
      />
    </div>
  );
}
