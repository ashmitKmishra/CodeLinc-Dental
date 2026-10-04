import type { Member, MemberUsage } from '@floss/contracts';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Money } from '@/components/ui/Money';
import { UsageMeter } from './UsageMeter';
import { cn } from '@/lib/cn';
import { ageOn, dayAfter, formatDate, money, todayIso } from '@/lib/format';

const relation: Record<Member['relationship'], string> = { self: 'You', spouse: 'Spouse', child: 'Child', other: 'Dependent' };

/** `wide` lays the card out in two columns, for when it has the whole row to itself (one person, or an odd one out). */
export function MemberUsageCard({ member, index, usage, wide = false }: { member: Member; index: number; usage: MemberUsage; wide?: boolean }) {
  const age = ageOn(member.birthDate, todayIso());
  const unlimited = usage.annualMaxCents == null;
  const dedMet = usage.deductibleCents != null && usage.deductibleCents > 0 && usage.deductibleMetCents >= usage.deductibleCents;
  const hasDetails = (usage.deductibleCents != null && usage.deductibleCents > 0) || (usage.orthoLifetime?.maxCents != null) || usage.frequency.length > 0;
  return (
    <article className={cn('rounded-lg border border-line bg-surface p-5', wide && 'md:grid md:items-center md:gap-10 md:p-6', wide && hasDetails && 'md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')}>
      <div className="flex flex-col gap-4">
        <header className="flex items-center gap-3">
          <Avatar name={member.firstName} index={index} size={36} />
          <div className="min-w-0">
            <h3 className="t-h3 truncate">{member.firstName}</h3>
            <p className="t-small text-ink-muted">{relation[member.relationship]}{member.relationship === 'child' ? ` · ${age}` : ''}</p>
          </div>
        </header>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="t-small-strong text-ink-muted">Annual maximum</p>
            {unlimited ? <Chip tone="ok">No yearly cap</Chip> : <p className="t-small text-ink-muted"><Money cents={usage.usedCents} className="t-small-strong text-ink" /> used of {money(usage.annualMaxCents)}</p>}
          </div>
          <UsageMeter used={usage.usedCents} max={usage.annualMaxCents} label={`${member.firstName}'s annual maximum used`} />
          <p className="flex flex-wrap items-center gap-x-2 t-small text-ink-muted">
            {unlimited ? <span>{money(usage.usedCents)} used this plan year</span> : <span><Money cents={usage.remainingCents} className="t-money-md text-ink" /> left</span>}
            <span aria-hidden>·</span><span>resets {formatDate(dayAfter(usage.planYear.end))}</span>
          </p>
        </div>
      </div>

      {hasDetails && (
        <dl className={cn('mt-4 grid gap-2 border-t border-line pt-4 t-small', wide && 'md:mt-0 md:border-l md:border-t-0 md:pl-10 md:pt-0')}>
          {usage.deductibleCents != null && usage.deductibleCents > 0 && (
            <div className="flex items-center justify-between gap-3"><dt className="text-ink-muted">Deductible</dt><dd>{dedMet ? <Chip tone="ok">Met</Chip> : <span className="tnum">{money(usage.deductibleMetCents)} of {money(usage.deductibleCents)}</span>}</dd></div>
          )}
          {usage.orthoLifetime && usage.orthoLifetime.maxCents != null && (
            <div className="flex items-center justify-between gap-3"><dt className="text-ink-muted">Orthodontics, lifetime</dt><dd className="tnum">{money(usage.orthoLifetime.usedCents)} of {money(usage.orthoLifetime.maxCents)}</dd></div>
          )}
          {usage.frequency.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3"><dt className="text-ink-muted">{f.label}</dt><dd className="tnum">{f.used}{f.allowed != null ? ` of ${f.allowed}` : ''} this year</dd></div>
          ))}
        </dl>
      )}
    </article>
  );
}
