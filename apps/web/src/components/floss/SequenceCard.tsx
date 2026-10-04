import type { Sequence } from '@floss/contracts';
import { motion } from 'motion/react';
import { CalendarRange, Info } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { Money } from '@/components/ui/Money';
import { dayAfter, formatDate, money } from '@/lib/format';

export function SequenceCard({ sequence, planYearStart }: { sequence: Sequence; planYearStart?: string }) {
  const saves = sequence.differenceCents > 0;
  const now = sequence.best.steps.filter((s) => s.window === 'this_plan_year');
  const later = sequence.best.steps.filter((s) => s.window === 'next_plan_year');
  const resetLabel = formatDate(dayAfter(sequence.planYearEnds));
  const chip = (s: (typeof now)[number]) => (
    <motion.li layout layoutId={`seq-${s.procedureCode}`} transition={{ type: 'spring', stiffness: 220, damping: 26 }} key={s.procedureCode} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2">
      <span className="t-small-strong">{s.label}</span><span className="t-small tnum text-ink-muted">you pay {money(s.estimate.youPayCents)}</span>
    </motion.li>
  );
  return (
    <section aria-label="Best order across the plan year" className="overflow-hidden rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 px-5 pt-4"><CalendarRange aria-hidden className="size-5 text-brand" /><h3 className="t-h3">Best order across the plan year</h3><Chip tone="info">Estimate</Chip></header>

      <div className={`mx-5 mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md p-4 ${saves ? 'bg-ok-soft' : 'bg-surface-2'}`}>
        <p className="t-h2">{saves ? <>Saves <Money cents={sequence.differenceCents} /></> : 'No savings from changing the order'}</p>
        <p className="t-small text-ink-muted">Everything this plan year: you pay {money(sequence.baseline.youPayCents)}. Best order: you pay {money(sequence.best.youPayCents)}.</p>
      </div>

      <div className="grid gap-px p-5 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
        <div className="flex flex-col gap-2">
          <p className="t-small-strong text-ink-muted">This plan year{planYearStart ? ` (from ${formatDate(planYearStart)})` : ''}</p>
          <ul className="flex min-h-12 flex-col gap-2">{now.length ? now.map(chip) : <li className="t-small text-ink-muted">Nothing scheduled</li>}</ul>
        </div>
        <div aria-hidden className="hidden flex-col items-center gap-1 sm:flex"><span className="t-small-strong text-warn">Resets {resetLabel}</span><span className="w-[3px] flex-1 rounded-full bg-accent" /></div>
        <div className="mt-4 flex flex-col gap-2 sm:mt-0">
          <p className="t-small-strong text-ink-muted">Next plan year</p>
          <ul className="flex min-h-12 flex-col gap-2">{later.length ? later.map(chip) : <li className="t-small text-ink-muted">Nothing scheduled</li>}</ul>
        </div>
      </div>

      <ul className="flex flex-col gap-2 border-t border-line bg-surface-2/50 px-5 py-4">
        {sequence.reasons.map((r) => <li key={r} className="t-small text-ink">{r}</li>)}
        {sequence.assumptions.map((a) => <li key={a} className="flex gap-2 t-small text-ink-muted"><Info aria-hidden className="mt-0.5 size-4 shrink-0" />{a}</li>)}
      </ul>
    </section>
  );
}
