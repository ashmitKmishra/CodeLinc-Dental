import { LayoutDashboard, MessageCircle, Send, Smartphone, MessageSquare } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { Wordmark } from '@/components/floss/Wordmark';
import { cn } from '@/lib/cn';

/**
 * Static picture of the Floss chat for the hero. It deliberately shows no dollar amounts: real figures
 * come from a member's own plan and dentist quote, never from marketing copy.
 */
export function AgentPreview({ className }: { className?: string }) {
  const nav = [
    { label: 'Overview', icon: LayoutDashboard }, { label: 'Chat', icon: MessageCircle, active: true },
  ];
  return (
    <div aria-hidden className={cn('flex h-full overflow-hidden rounded-[22px] bg-canvas text-ink', className)}>
      <aside className="hidden w-52 shrink-0 flex-col gap-6 bg-shell p-4 md:flex">
        <Wordmark dark className="px-2" />
        <nav className="flex flex-col gap-1">
          {nav.map(({ label, icon: Icon, active }) => (
            <span key={label} className={cn('flex items-center gap-3 rounded-md px-3 py-2 t-small-strong', active ? 'bg-shell-active text-shell-ink' : 'text-shell-muted')}>
              <Icon className="size-[18px]" /> {label}
            </span>
          ))}
        </nav>
        <span className="mt-auto flex items-center gap-2 rounded-md bg-shell-active px-3 py-2 t-small-strong text-shell-ink"><MessageSquare className="size-4" /> Texting linked</span>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3.5">
          <h3 className="t-h3">Chat</h3>
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 t-small-strong text-brand"><Smartphone className="size-3.5" /> App</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 t-small-strong text-channel-text"><MessageSquare className="size-3.5" /> Text</span>
          <span className="ml-auto hidden t-small text-ink-muted sm:block">Every message is saved</span>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden px-5 py-5">
          <div className="ml-auto max-w-[78%] rounded-lg bg-brand px-4 py-3 text-on-brand">My dentist says I need a crown. What will I owe?</div>
          <div className="flex max-w-[88%] gap-3">
            <span className="mt-1 inline-block size-7 shrink-0 rounded-[9px] bg-brand" />
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-line bg-surface px-4 py-3">
                A crown is major care on your plan. Your plan pays a share of the cost after your deductible, up to what’s left of your annual maximum. What did your dentist quote?
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip tone="brand">Major care</Chip>
                <Chip tone="neutral">Deductible applies</Chip>
                <Chip tone="neutral">Counts toward annual maximum</Chip>
              </div>
            </div>
          </div>
          <div className="ml-auto max-w-[78%] rounded-lg bg-channel-text px-4 py-3 text-on-brand">Email me this chat</div>
          <div className="flex max-w-[88%] gap-3">
            <span className="mt-1 inline-block size-7 shrink-0 rounded-[9px] bg-brand" />
            <div className="rounded-lg border border-line bg-surface px-4 py-3">Done. A transcript of this conversation is on its way to your inbox.</div>
          </div>
        </div>

        <div className="border-t border-line bg-surface p-4">
          <div className="flex items-center gap-3 rounded-md border border-line-strong px-4 py-3 text-ink-muted">
            <span className="flex-1 truncate">Ask about a procedure, a cost, or your plan</span>
            <span className="rounded-md bg-brand p-2 text-on-brand"><Send className="size-4" /></span>
          </div>
        </div>
      </div>
    </div>
  );
}
