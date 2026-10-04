import type { Message, MemberUsage, PendingAction, Snapshot } from '@floss/contracts';
import { Mail, MessageCircle, MessageSquare, Smartphone } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatTime } from '@/lib/format';
import { EstimateCard } from './EstimateCard';
import { MemberUsageCard } from './MemberUsageCard';
import { PendingActionCard } from './PendingActionCard';
import { RichText } from './RichText';
import { SequenceCard } from './SequenceCard';

const channelMeta = { app: { label: 'App', icon: Smartphone, cls: 'text-brand' }, sms: { label: 'Text', icon: MessageSquare, cls: 'text-channel-text' }, email: { label: 'Email', icon: Mail, cls: 'text-channel-email' }, whatsapp: { label: 'WhatsApp', icon: MessageCircle, cls: 'text-channel-text' } } as const;

export function ChannelBadge({ channel }: { channel: Message['channel'] }) {
  const { label, icon: Icon, cls } = channelMeta[channel];
  return <span className={cn('inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 t-small-strong', cls)}><Icon aria-hidden className="size-3.5" />{label}</span>;
}

interface Props { message: Message; snapshot: Snapshot; busy: boolean; onConfirm: (id: string) => void; onCancel: (id: string) => void }

export function ChatMessage({ message: m, snapshot, busy, onConfirm, onCancel }: Props) {
  const memberName = (id: string) => snapshot.household.members.find((x) => x.id === id)?.firstName;

  if (m.role === 'system') {
    return (
      <div className="flex items-center justify-center gap-2 py-1 t-small text-ink-muted">
        <ChannelBadge channel={m.channel} /><span>{m.text}</span><span aria-hidden>·</span><time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
      </div>
    );
  }

  const mine = m.role === 'user';
  const pendingNow = new Set(snapshot.pendingActions.map((a) => a.id));
  return (
    <article className={cn('flex gap-3', mine && 'justify-end')} aria-label={mine ? 'You' : 'Floss'}>
      {!mine && <span aria-hidden className="mt-1 inline-block size-7 shrink-0 rounded-[9px] bg-brand" />}
      <div className={cn('flex min-w-0 max-w-[min(100%,640px)] flex-col gap-2', mine && 'items-end')}>
        <p className={cn('whitespace-pre-wrap rounded-lg px-4 py-3', mine ? (m.channel === 'sms' || m.channel === 'whatsapp' ? 'bg-channel-text text-on-brand' : 'bg-brand text-on-brand') : 'border border-line bg-surface')}><RichText text={m.text} /></p>
        {m.cards.map((c, i) => {
          if (c.type === 'estimate') return <div key={i} className="w-full"><EstimateCard estimate={c.estimate} memberName={memberName(c.estimate.memberId)} compact /></div>;
          if (c.type === 'sequence') return <div key={i} className="w-full"><SequenceCard sequence={c.sequence} /></div>;
          if (c.type === 'usage') {
            const member = snapshot.household.members.find((x) => x.id === c.memberId);
            const usage: MemberUsage | undefined = snapshot.usage.find((x) => x.memberId === c.memberId);
            return member && usage ? <div key={i} className="w-full max-w-sm"><MemberUsageCard member={member} index={snapshot.household.members.indexOf(member)} usage={usage} /></div> : null;
          }
          const a: PendingAction = pendingNow.has(c.action.id) ? c.action : { ...c.action, status: c.action.status === 'pending' ? 'applied' : c.action.status };
          return <div key={i} className="w-full"><PendingActionCard action={a} busy={busy} onConfirm={() => onConfirm(a.id)} onCancel={() => onCancel(a.id)} /></div>;
        })}
        <p className="flex items-center gap-2 t-small text-ink-muted"><ChannelBadge channel={m.channel} /><time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time></p>
      </div>
    </article>
  );
}
