import type { PendingAction } from '@floss/contracts';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';

export function PendingActionCard({ action, onConfirm, onCancel, busy }: { action: PendingAction; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  const done = action.status !== 'pending';
  return (
    <section aria-label="Needs your OK" className="overflow-hidden rounded-lg border-[1.5px] border-dashed border-pending bg-surface text-ink">
      <header className="flex items-center gap-2 px-4 pt-3">
        {done ? <Chip tone={action.status === 'applied' ? 'ok' : 'neutral'} icon={action.status === 'applied' ? <Check className="size-3.5" /> : undefined}>{action.status === 'applied' ? 'Done' : 'Cancelled'}</Chip> : <Chip tone="warn">Needs your OK</Chip>}
      </header>
      <p className="px-4 py-2 t-body-strong">{action.previewText}</p>
      {!done && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <Button size="sm" onClick={onConfirm} disabled={busy}>Confirm</Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <span className="ml-auto t-small text-ink-muted">or text <span className="t-mono text-brand">CONFIRM {action.confirmToken}</span></span>
        </div>
      )}
    </section>
  );
}
