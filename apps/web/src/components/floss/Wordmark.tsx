import { cn } from '@/lib/cn';

export function Wordmark({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span aria-hidden className={cn('relative inline-block size-7 rounded-[9px]', dark ? 'bg-accent' : 'bg-brand')}>
        <span className={cn('absolute left-1/2 top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full', dark ? 'bg-shell' : 'bg-on-brand')} />
      </span>
      <span className={cn('font-display text-[22px] font-bold tracking-tight', dark ? 'text-shell-ink' : 'text-ink')}>Floss</span>
    </span>
  );
}
