import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/cn';

const thread: { mine?: boolean; text: string }[] = [
  { mine: true, text: 'What will a crown cost me?' },
  { text: 'A crown is major care on your plan. Your plan pays a share after your deductible, up to what’s left of your annual maximum. What did your dentist quote?' },
  { mine: true, text: 'Email me this chat' },
  { text: 'Sent. A transcript is on its way to your inbox.' },
];

/** SMS thread in a phone frame. No dollar amounts, for the same reason as the hero preview. */
export function PhoneMock({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('mx-auto w-[300px] rounded-[44px] bg-ink p-3 shadow-e3', className)}>
      <div className="flex h-[560px] flex-col gap-3 overflow-hidden rounded-[34px] bg-surface-2 px-4 pb-4 pt-12">
        <div className="flex items-center gap-2 text-ink-muted"><MessageSquare className="size-4 text-channel-text" /><span className="t-small-strong">Floss</span></div>
        {thread.map((m, i) => (
          <div key={i} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
            <p className={cn('max-w-[86%] rounded-lg px-3.5 py-2.5 t-small', m.mine ? 'bg-channel-text text-on-brand' : 'bg-surface text-ink')}>{m.text}</p>
          </div>
        ))}
        <div className="mt-auto rounded-full border border-line-strong bg-surface px-4 py-2.5 t-small text-ink-muted">Text message</div>
      </div>
    </div>
  );
}
