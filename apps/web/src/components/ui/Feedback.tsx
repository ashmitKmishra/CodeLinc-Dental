import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Spinner = ({ className }: { className?: string }) => <Loader2 aria-label="Loading" className={cn('size-5 animate-spin text-ink-muted', className)} />;

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-2', className)} />;

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="rounded-full bg-brand-soft p-3 text-brand">{icon}</div>}
      <h3 className="t-h3">{title}</h3>
      {body && <p className="max-w-sm text-ink-muted">{body}</p>}
      {action}
    </div>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; title?: string; children?: ReactNode }) {
  const t = { info: 'bg-info-soft text-info', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', ok: 'bg-ok-soft text-ok' }[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-md p-4', t)}>
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-1">
        {title && <p className="t-body-strong text-ink">{title}</p>}
        {children && <div className="t-small text-ink-muted">{children}</div>}
      </div>
    </div>
  );
}
