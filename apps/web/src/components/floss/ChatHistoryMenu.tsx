import { useEffect, useRef, useState } from 'react';
import type { Conversation } from '@floss/contracts';
import { ChevronDown, MessageCircle, Plus, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatDate, formatTime } from '@/lib/format';

const sections = [
  { channel: 'app', label: 'App', icon: Smartphone, empty: 'No app chats yet.' },
  { channel: 'whatsapp', label: 'WhatsApp Messenger', icon: MessageCircle, empty: 'No WhatsApp chats yet.' },
] as const;

const when = (iso: string) => (new Date(iso).toDateString() === new Date().toDateString() ? formatTime(iso) : formatDate(iso));

/** "History" dropdown: New chat, then past chats grouped by where they happened (App vs WhatsApp Messenger). */
export function ChatHistoryMenu({ conversations, activeId, onSelect, onNew }: { conversations: Conversation[]; activeId: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const pick = (fn: () => void) => { setOpen(false); fn(); };

  return (
    <div ref={root} className="relative">
      <Button variant="secondary" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        History<ChevronDown aria-hidden className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </Button>
      {open && (
        <div role="menu" aria-label="Chat history" className="absolute right-0 z-30 mt-2 flex max-h-[70dvh] w-[min(92vw,360px)] flex-col gap-3 overflow-y-auto rounded-lg border border-line bg-surface p-2 shadow-lg">
          <button type="button" role="menuitem" onClick={() => pick(onNew)} className="flex h-11 items-center gap-2 rounded-md bg-brand px-3 t-body-strong text-on-brand transition-colors hover:bg-brand-hover">
            <Plus aria-hidden className="size-4" />New chat
          </button>
          {sections.map(({ channel, label, icon: Icon, empty }) => {
            const items = conversations.filter((c) => c.channel === channel);
            return (
              <section key={channel} aria-label={label} className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 px-2 pt-1 t-small-strong text-ink-muted"><Icon aria-hidden className={cn('size-4', channel === 'whatsapp' && 'text-channel-text')} />{label}</h3>
                {items.length === 0 ? <p className="px-2 pb-1 t-small text-ink-muted">{empty}</p> : items.map((c) => (
                  <button key={c.id} type="button" role="menuitem" onClick={() => pick(() => onSelect(c.id))} aria-current={c.id === activeId ? 'true' : undefined}
                    className={cn('flex flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2', c.id === activeId && 'bg-brand-soft')}>
                    <span className="line-clamp-1 w-full t-body-strong">{c.title}</span>
                    <span className="t-small text-ink-muted">{c.messageCount} messages · {when(c.updatedAt)}</span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
