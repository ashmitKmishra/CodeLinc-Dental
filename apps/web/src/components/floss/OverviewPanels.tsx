import type { PlanSummary, Snapshot } from '@floss/contracts';
import { BellRing, Check, ChevronDown, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Chip, SourceChip } from '@/components/ui/Chip';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { Money } from '@/components/ui/Money';
import { Switch } from '@/components/ui/Switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dayAfter, formatDate, plural } from '@/lib/format';
import { errorMessage, useAction } from '@/lib/hooks';

const timings = [60, 30, 14];
const DAY = 86_400_000;

/**
 * Reminders before the plan year ends. Reads top to bottom: when benefits reset and how much is left, which
 * reminders are on, then a timeline of when they go out. The sentence each reminder carries is shown once.
 */
export function RemindersPanel({ snapshot: s, className }: { snapshot: Snapshot; className?: string }) {
  const { preferences, reminders, plan, usage, household } = s;
  const prefs = useAction((p: typeof preferences) => api.updatePreferences(p));
  const set = (patch: Partial<typeof preferences>) => prefs.mutate({ ...preferences, ...patch }, { onError: (e) => toast.error(errorMessage(e)) });
  const toggleDays = (d: number) => set({ reminderDaysBefore: preferences.reminderDaysBefore.includes(d) ? preferences.reminderDaysBefore.filter((x) => x !== d) : [...preferences.reminderDaysBefore, d].sort((a, b) => b - a) });

  const year = usage[0]?.planYear;
  const unlimited = plan.annualMax.amountCents == null;
  const leftCents = usage.reduce((sum, u) => sum + (u.remainingCents ?? 0), 0);
  const people = household.members.length;
  const timeline = [...reminders].sort((a, b) => a.sendOn.localeCompare(b.sendOn));
  const daysBefore = (sendOn: string) => (year ? Math.round((Date.parse(year.end) - Date.parse(sendOn)) / DAY) : null);

  return (
    <Panel aria-label="Reminders" className={className}>
      <PanelHeader title="Reminders" icon={<BellRing aria-hidden className="size-5 text-brand" />} right={<><span className="t-small text-ink-muted">{preferences.remindersOptIn ? 'On' : 'Off'}</span><Switch label="Remind me before my benefits reset" checked={preferences.remindersOptIn} onChange={(v) => set({ remindersOptIn: v })} /></>} />

      {!preferences.remindersOptIn ? (
        <p className="border-t border-line px-5 py-4 text-ink-muted">Reminders are off. Turn them on and Floss will nudge you before the plan year ends.</p>
      ) : (
        <div className="flex flex-col gap-5 border-t border-line px-5 py-5">
          {year && (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="t-small text-ink-muted">Benefits reset</dt>
                <dd className="t-h3 mt-0.5">{formatDate(dayAfter(year.end))}</dd>
                <dd className="t-small text-ink-muted">in {plural(year.daysToReset, 'day')}</dd>
              </div>
              <div>
                <dt className="t-small text-ink-muted">Still available</dt>
                <dd className="mt-0.5">{unlimited ? <span className="t-h3">No yearly cap</span> : <Money cents={leftCents} className="t-h3" />}</dd>
                {!unlimited && <dd className="t-small text-ink-muted">{people === 1 ? 'for you' : `across ${plural(people, 'person', 'people')}`}</dd>}
              </div>
            </dl>
          )}

          <div role="group" aria-labelledby="remind-days" className="flex flex-col gap-2">
            <p id="remind-days" className="t-small-strong text-ink-muted">Remind me before the plan year ends</p>
            <div className="flex flex-wrap gap-2">
              {timings.map((d) => {
                const on = preferences.reminderDaysBefore.includes(d);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => toggleDays(d)}
                    className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 t-small-strong transition-colors duration-150', on ? 'border-brand/30 bg-brand-soft text-brand' : 'border-line-strong bg-surface text-ink-muted hover:bg-surface-2')}>
                    {on && <Check aria-hidden className="size-3.5" />}{d} days
                  </button>
                );
              })}
            </div>
          </div>

          {timeline.length === 0 ? (
            <p className="text-ink-muted">{unlimited ? 'Your plan has no annual maximum, so there’s nothing to run out.' : preferences.reminderDaysBefore.length === 0 ? 'Pick at least one reminder above.' : 'Nothing to remind you about. Everyone has used their annual maximum.'}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="t-small-strong text-ink-muted">Upcoming reminders</p>
              <ol className="relative ml-[5px] border-l border-line-strong">
                {timeline.map((r) => (
                  <li key={r.id} className="relative flex flex-wrap items-baseline gap-x-3 pb-4 pl-5">
                    <span aria-hidden className={cn('absolute -left-[6px] top-[7px] size-[11px] rounded-full ring-4 ring-surface', r.status === 'sent' ? 'bg-ok' : 'bg-brand')} />
                    <span className="t-body-strong">{formatDate(r.sendOn)}</span>
                    <span className="t-small text-ink-muted">{daysBefore(r.sendOn)} days before</span>
                    {r.status === 'sent' && <Chip tone="ok" className="ml-auto">Sent</Chip>}
                  </li>
                ))}
                {year && (
                  <li className="relative flex flex-wrap items-baseline gap-x-3 pl-5">
                    <span aria-hidden className="absolute -left-[8px] top-[5px] size-[15px] rounded-full border-[3px] border-accent bg-surface ring-4 ring-surface" />
                    <span className="t-body-strong">{formatDate(year.end)}</span>
                    <span className="t-small text-ink-muted">Plan year ends</span>
                  </li>
                )}
              </ol>
              <details className="group rounded-md bg-surface-2 px-3.5 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between t-small-strong text-brand marker:content-none">What a reminder says<ChevronDown aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-180" /></summary>
                <p className="mt-2 t-small text-ink-muted">{timeline[0]!.body}</p>
              </details>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function PlanOnFilePanel({ plan, className }: { plan: PlanSummary; className?: string }) {
  return (
    <Panel aria-label="Your plan on file" className={className}>
      <PanelHeader title="Your plan on file" icon={<FileText aria-hidden className="size-5 text-brand" />} />
      <div className="flex flex-col gap-2 border-t border-line px-5 py-4">
        <p className="t-body-strong">{plan.name}</p>
        <p className="t-small text-ink-muted">{plan.carrier} · {plan.planYear.label}</p>
        <SourceChip label={plan.sourceDocument.fileName} className="w-fit max-w-full break-all" />
        <p className="t-small text-ink-muted">{plan.sourceDocument.pages} {plan.sourceDocument.pages === 1 ? 'page' : 'pages'} read from your plan document</p>
      </div>
    </Panel>
  );
}
