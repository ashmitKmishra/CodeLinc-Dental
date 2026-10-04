import { useState } from 'react';
import type { Estimate, EstimateItem } from '@floss/contracts';
import { ChevronDown, Info } from 'lucide-react';
import { Chip, SourceChip } from '@/components/ui/Chip';
import { Money } from '@/components/ui/Money';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

function ItemRow({ item }: { item: EstimateItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-line first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-2/60">
        <div className="min-w-0 flex-1">
          <p className="t-body-strong">{item.label}</p>
          <p className="t-small text-ink-muted">{item.status === 'not_covered' ? 'Not covered' : `Plan pays ${money(item.planPaysCents)}`}</p>
        </div>
        <span className="t-money-md tnum">{money(item.youPayCents)}</span>
        <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="flex flex-col gap-3 bg-surface-2/50 px-5 py-4">
          {item.lines.map((l, i) => (
            <li key={i} className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <p className="t-small text-ink">{l.why}</p>
                <span className="t-small-strong tnum shrink-0">{money(l.amountCents)}</span>
              </div>
              {l.source?.page ? <SourceChip page={l.source.page} className="w-fit" /> : <span className="t-small text-ink-muted">{l.rule}</span>}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export function EstimateCard({ estimate, memberName, compact = false, title = 'What you’d owe' }: { estimate: Estimate; memberName?: string; compact?: boolean; title?: string }) {
  const t = estimate.totals;
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface text-ink" aria-label={title}>
      <header className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <h3 className="t-h3">{title}</h3>
        {memberName && <Chip tone="neutral">{memberName}</Chip>}
        <Chip tone="info">Estimate</Chip>
        <span className="ml-auto t-small text-ink-muted">{estimate.tierLabel}</span>
      </header>

      <dl className={cn('grid gap-4 px-5 py-4', compact ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3')}>
        <div><dt className="t-small text-ink-muted">Dentist’s quote</dt><dd className="t-money-md tnum">{money(t.billedCents)}</dd></div>
        <div><dt className="t-small text-ink-muted">Plan pays</dt><dd className="t-money-md tnum text-ok"><Money cents={t.planPaysCents} /></dd></div>
        <div><dt className="t-small text-ink-muted">You pay</dt><dd className="t-money-lg text-ink"><Money cents={t.youPayCents} /></dd></div>
      </dl>

      <ul className="border-t border-line">{estimate.items.map((it) => <ItemRow key={it.procedureCode} item={it} />)}</ul>

      {(estimate.assumptions.length > 0 || estimate.remainingAnnualMaxAfterCents != null) && (
        <div className="flex flex-col gap-2 border-t border-line bg-surface-2/50 px-5 py-4">
          {estimate.remainingAnnualMaxAfterCents != null && <p className="t-small text-ink-muted">After this, <span className="t-small-strong text-ink">{money(estimate.remainingAnnualMaxAfterCents)}</span> would be left of the annual maximum.</p>}
          {estimate.assumptions.map((a) => (
            <p key={a} className="flex gap-2 t-small text-ink-muted"><Info aria-hidden className="mt-0.5 size-4 shrink-0" />{a}</p>
          ))}
        </div>
      )}
      <p className="border-t border-line px-5 py-3 t-small text-ink-muted">An estimate, not a guarantee of payment. Your dentist or insurer confirms the final amount.</p>
    </section>
  );
}
