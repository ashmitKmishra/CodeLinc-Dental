import type { PlanSummary, Snapshot } from '@floss/contracts';
import { BellRing, FileText, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Chip, SourceChip } from '@/components/ui/Chip';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { Switch } from '@/components/ui/Switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { errorMessage, useAction } from '@/lib/hooks';

const timings = [60, 30, 14];

/** Reminders before the plan year ends: the list, plus the on/off switch and timing. */
export function RemindersPanel({ snapshot: s, className }: { snapshot: Snapshot; className?: string }) {
  const { preferences, reminders, plan } = s;
  const prefs = useAction((p: typeof preferences) => api.updatePreferences(p));
  const set = (patch: Partial<typeof preferences>) => prefs.mutate({ ...preferences, ...patch }, { onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Panel aria-label="Reminders" className={className}>
      <PanelHeader title="Reminders" icon={<BellRing aria-hidden className="size-5 text-brand" />} right={<><span className="t-small text-ink-muted">{preferences.remindersOptIn ? 'On' : 'Off'}</span><Switch label="Remind me before my benefits reset" checked={preferences.remindersOptIn} onChange={(v) => set({ remindersOptIn: v })} /></>} />
      {preferences.remindersOptIn && (
        <div role="group" aria-labelledby="remind-days" className="flex flex-col gap-2 border-t border-line px-5 py-4">
          <p id="remind-days" className="t-small-strong text-ink-muted">Remind me this many days before the plan year ends</p>
          <div className="flex flex-wrap gap-4">
            {timings.map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={preferences.reminderDaysBefore.includes(d)} onChange={(e) => set({ reminderDaysBefore: e.target.checked ? [...preferences.reminderDaysBefore, d].sort((a, b) => b - a) : preferences.reminderDaysBefore.filter((x) => x !== d) })} />
                {d} days
              </label>
            ))}
          </div>
        </div>
      )}
      {reminders.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-ink-muted">
          {!preferences.remindersOptIn ? 'Reminders are off. Turn them on and Floss will nudge you before the plan year ends.' : plan.annualMax.amountCents == null ? 'Your plan has no annual maximum, so there’s nothing to run out.' : 'Nothing to remind you about. Everyone has used their annual maximum.'}
        </p>
      ) : (
        <ul className="border-t border-line">
          {reminders.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 border-b border-line px-5 py-3.5 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2"><p className="t-body-strong">{r.title}</p><Chip tone={r.status === 'sent' ? 'ok' : 'neutral'}>{r.status === 'sent' ? 'Sent' : `Scheduled ${formatDate(r.sendOn)}`}</Chip></div>
              <p className="t-small text-ink-muted">{r.body}</p>
            </li>
          ))}
        </ul>
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

export function TranscriptPanel({ email, hasMessages, className }: { email: string; hasMessages: boolean; className?: string }) {
  const send = useAction(() => api.requestTranscript());
  return (
    <Panel aria-label="Chat transcript" className={className}>
      <PanelHeader title="Chat transcript" icon={<Mail aria-hidden className="size-5 text-brand" />} />
      <div className={cn('flex flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-4')}>
        <div className="min-w-[200px] flex-1">
          <p className="t-body-strong">Email me a copy of my chats</p>
          <p className="t-small text-ink-muted">Sent to {email}. Includes messages from the app and by text.</p>
        </div>
        <Button variant="secondary" disabled={send.isPending || !hasMessages} onClick={() => send.mutate(undefined, { onSuccess: () => toast.success(`Transcript sent to ${email}`), onError: (e) => toast.error(errorMessage(e)) })}>{send.isPending ? 'Sending…' : 'Email transcript'}</Button>
      </div>
      {!hasMessages && <p className="border-t border-line px-5 py-3 t-small text-ink-muted">No messages yet. Start a chat and you can email it to yourself.</p>}
    </Panel>
  );
}
