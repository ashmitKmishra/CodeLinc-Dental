import { LogOut, MessageSquare } from 'lucide-react';
import { MemberUsageCard } from '@/components/floss/MemberUsageCard';
import { PlanOnFilePanel, RemindersPanel, TranscriptPanel } from '@/components/floss/OverviewPanels';
import { useOpenTexting } from '@/components/floss/TextingContext';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { signOut, useAuthUser } from '@/lib/authStore';
import { cn } from '@/lib/cn';
import { dayAfter, formatDate, plural } from '@/lib/format';
import { useLoaded } from '@/lib/hooks';

export default function Overview() {
  const s = useLoaded();
  const user = useAuthUser();
  const openTexting = useOpenTexting();
  const { plan, household, usage, messaging } = s;
  const year = usage[0]?.planYear;
  const cards = household.members.flatMap((m, i) => { const u = usage.find((x) => x.memberId === m.id); return u ? [{ m, i, u }] : []; });
  const solo = cards.length === 1;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1">
          <h1 className="t-h1">Your dental benefits</h1>
          <p className="text-ink-muted">{plan.carrier} · {plan.name}</p>
        </div>
        {year && <Chip tone="warn">Plan year resets {formatDate(dayAfter(year.end))} · {plural(year.daysToReset, 'day')}</Chip>}
      </header>

      {messaging.status !== 'linked' && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-brand-soft p-5">
          <MessageSquare aria-hidden className="size-6 text-brand" />
          <div className="min-w-[220px] flex-1">
            <p className="t-body-strong">Your AI buddy is one text away</p>
            <p className="t-small text-ink-muted">Connect your phone and you can ask Floss anything about your plan without opening the app.</p>
          </div>
          <Button onClick={openTexting}>Connect texting</Button>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-label={solo ? 'Your annual maximum' : 'Annual maximum by person'} className="flex min-w-0 flex-col gap-3">
          <h2 className="t-h2">{solo ? 'Your annual maximum' : 'Annual maximum, by person'}</h2>
          <div className={cn('grid gap-4', !solo && '2xl:grid-cols-2')}>
            {cards.map(({ m, i, u }, n) => (
              <div key={m.id} className={cn(!solo && cards.length % 2 === 1 && n === cards.length - 1 && '2xl:col-span-2')}>
                <MemberUsageCard member={m} index={i} usage={u} wide={solo || (cards.length % 2 === 1 && n === cards.length - 1)} />
              </div>
            ))}
          </div>
        </section>

        <aside aria-label="Account" className="flex min-w-0 flex-col gap-6">
          <RemindersPanel snapshot={s} />
          <PlanOnFilePanel plan={plan} />
          <TranscriptPanel email={user?.email ?? ''} hasMessages={s.messages.length > 0} />
          <div className="flex items-center justify-between gap-3 rounded-lg border border-bad/25 bg-bad-soft p-4">
            <p className="min-w-0 truncate t-small text-bad">Signed in as {user?.email}</p>
            <Button variant="danger" onClick={() => signOut()}><LogOut aria-hidden className="size-4" />Sign out</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
