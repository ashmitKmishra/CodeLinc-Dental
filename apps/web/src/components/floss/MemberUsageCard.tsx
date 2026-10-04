import type { Member, MemberUsage } from '@floss/contracts';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Money } from '@/components/ui/Money';
import { UsageMeter } from './UsageMeter';
import { cn } from '@/lib/cn';
import { ageOn, dayAfter, formatDate, money, todayIso } from '@/lib/format';

const relation: Record<Member['relationship'], string> = { self: 'You', spouse: 'Spouse', child: 'Child', other: 'Dependent' };

/**
 * A square tile. The grid in Overview decides the width, so the card stacks everything in one column and lets
 * rows wrap instead of squeezing. `aspect-square` is a minimum: a tile with extra rows grows taller, never clips.
 */
export function MemberUsageCard({ member, index, usage, className }: { member: Member; index: number; usage: MemberUsage; className?: string }) {
  const age = ageOn(member.birthDate, todayIso());
  const unlimited = usage.annualMaxCents == null;
  const dedMet = usage.deductibleCents != null && usage.deductibleCents > 0 && usage.deductibleMetCents >= usage.deductibleCents;
  const hasDetails = (usage.deductibleCents != null && usage.deductibleCents > 0) || (usage.orthoLifetime?.maxCents != null) || usage.frequency.length > 0;
  const row = 'flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-0.5';
  return (
    <article className={cn('flex aspect-square max-[560px]:aspect-auto min-w-0 flex-col gap-5 rounded-lg border border-line bg-surface p-5', className)}>
      <header className="flex items-center gap-3">
        <Avatar name={member.firstName} index={index} size={40} />
        <div className="min-w-0">
          <h3 className="t-h3 truncate">{member.firstName}</h3>
          <p className="t-small text-ink-muted">{relation[member.relationship]}{member.relationship === 'child' ? ` · ${age}` : ''}{member.memberNumber ? ` · ID ${member.memberNumber}` : ''}</p>
        </div>
      </header>

      <div className="flex flex-col gap-2.5">
        <div>
          <p className="t-small-strong text-ink-muted">Annual maximum</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            {unlimited
              ? <><Money cents={usage.usedCents} className="t-money-lg text-ink" /><span className="t-small text-ink-muted">used this plan year</span></>
              : <><Money cents={usage.remainingCents} className="t-money-lg text-ink" /><span className="t-small text-ink-muted">left</span></>}
          </p>
        </div>
        <UsageMeter used={usage.usedCents} max={usage.annualMaxCents} label={`${member.firstName}'s annual maximum used`} />
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 t-small text-ink-muted">
          {unlimited ? <Chip tone="ok">No yearly cap</Chip> : <span><Money cents={usage.usedCents} className="t-small-strong text-ink" /> used of {money(usage.annualMaxCents)}</span>}
          <span aria-hidden>·</span><span>resets {formatDate(dayAfter(usage.planYear.end))}</span>
        </p>
      </div>

      {hasDetails && (
        <dl className="mt-auto grid gap-2 border-t border-line pt-4 t-small">
          {usage.deductibleCents != null && usage.deductibleCents > 0 && (
            <div className={row}><dt className="text-ink-muted">Deductible</dt><dd>{dedMet ? <Chip tone="ok">Met</Chip> : <span className="tnum">{money(usage.deductibleMetCents)} of {money(usage.deductibleCents)}</span>}</dd></div>
          )}
          {usage.orthoLifetime && usage.orthoLifetime.maxCents != null && (
            <div className={row}><dt className="text-ink-muted">Orthodontics, lifetime</dt><dd className="tnum">{money(usage.orthoLifetime.usedCents)} of {money(usage.orthoLifetime.maxCents)}</dd></div>
          )}
          {usage.frequency.map((f) => (
            <div key={f.key} className={row}><dt className="text-ink-muted">{f.label}</dt><dd className="tnum">{f.used}{f.allowed != null ? ` of ${f.allowed}` : ''} this year</dd></div>
          ))}
        </dl>
      )}
    </article>
  );
}
