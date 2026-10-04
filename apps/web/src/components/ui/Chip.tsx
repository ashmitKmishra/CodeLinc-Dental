import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-muted',
  brand: 'bg-brand-soft text-brand',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
};

export function Chip({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 t-small-strong', tones[tone], className)}>{icon}{children}</span>;
}

/** Shows where a number came from. Every figure that comes from the plan document carries one. */
export function SourceChip({ page, label, icon, className }: { page?: number | null; label?: string; icon?: ReactNode; className?: string }) {
  const text = label ?? (page ? `Plan PDF · p.${page}` : 'Plan PDF');
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-sm bg-surface-2 px-2 py-0.5 t-small text-ink-muted', className)}>
      {icon ?? <FileText aria-hidden className="size-3.5" />}
      {text}
    </span>
  );
}
