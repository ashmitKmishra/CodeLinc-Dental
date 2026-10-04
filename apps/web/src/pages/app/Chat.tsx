import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@floss/contracts';
import { Mail, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { ChatHistoryMenu } from '@/components/floss/ChatHistoryMenu';
import { ChatMessage } from '@/components/floss/ChatMessage';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { api, isLive } from '@/lib/api';
import { errorMessage, useAction, useLoaded, useRefreshAfter } from '@/lib/hooks';
import { cn } from '@/lib/cn';

const suggestions = isLive
  ? ['How much are braces in network?', 'Where should I get a teeth cleaning?', 'What does a filling cost without insurance?', 'Wisdom teeth: in or out of network?']
  : ['What will a crown cost me?', 'What’s left of my annual maximum?', 'Explain my deductible', 'Email me this conversation'];

function Typing() {
  return (
    <div role="status" aria-label="Floss is working on it" className="flex items-center gap-3">
      <span aria-hidden className="inline-block size-7 shrink-0 rounded-[9px] bg-brand" />
      <span className="flex gap-1 rounded-lg border border-line bg-surface px-4 py-3.5">
        {[0, 1, 2].map((i) => <span key={i} className="size-2 animate-bounce rounded-full bg-ink-muted/70" style={{ animationDelay: `${i * 120}ms` }} />)}
      </span>
    </div>
  );
}

export default function Chat() {
  const snap = useLoaded();
  const refresh = useRefreshAfter();
  const [text, setText] = useState('');
  const [turnId, setTurnId] = useState<string | null>(null);
  const qc = useQueryClient();
  /** undefined = open the latest app chat, 'new' = blank chat, otherwise a conversation id. */
  const [selected, setSelected] = useState<string | undefined>();

  const convs = useQuery({ queryKey: ['conversations'], queryFn: () => api.listConversations(), enabled: isLive, refetchInterval: 4000 });
  const conversations = convs.data ?? [];
  const activeId = selected === 'new' ? null : selected ?? conversations.find((c) => c.channel === 'app')?.id ?? null;
  const active = conversations.find((c) => c.id === activeId);
  const readOnly = !!active && active.channel !== 'app';
  const thread = useQuery({
    queryKey: ['messages', activeId], enabled: isLive && !!activeId, refetchInterval: 2000,
    queryFn: () => api.listMessages({ conversationId: activeId! }),
  });
  const messages: Message[] = isLive ? (thread.data?.messages ?? []) : snap.messages;
  const refreshChats = () => { void qc.invalidateQueries({ queryKey: ['messages'] }); void qc.invalidateQueries({ queryKey: ['conversations'] }); };
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const turn = useQuery({
    queryKey: ['turn', turnId], enabled: !!turnId, queryFn: () => api.getTurn(turnId!),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'completed' || q.state.data.status === 'failed') ? false : 700),
  });
  useEffect(() => {
    const t = turn.data;
    if (t && (t.status === 'completed' || t.status === 'failed')) {
      if (t.status === 'failed') toast.error(t.error?.message ?? 'Floss couldn’t answer. Try again.');
      setTurnId(null); void refresh(); refreshChats();
    }
  }, [turn.data, refresh]);
  useEffect(() => { if (turn.error) { toast.error(errorMessage(turn.error)); setTurnId(null); } }, [turn.error]);

  const working = !!turnId;
  const [sending, setSending] = useState<string | null>(null);
  const send = useAction(async (t: string) => {
    setSending(t);
    try {
      const r = await api.sendTurn(t, activeId ?? undefined);
      if (r.conversationId) setSelected(r.conversationId);
      setTurnId(r.turnId); refreshChats();
    } finally { setSending(null); }
  });
  const confirm = useAction((id: string) => api.confirmAction(id));
  const cancel = useAction((id: string) => api.cancelAction(id));
  const transcript = useAction(() => api.requestTranscript());

  const submit = (value = text) => {
    const v = value.trim();
    if (!v || working || send.isPending) return;
    setText('');
    send.mutate(v, { onError: (e) => { setText(v); toast.error(errorMessage(e)); } });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, working, send.isPending]);
  useEffect(() => { const el = inputRef.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; } }, [text]);

  const actError = (fn: () => void) => ({ onError: (e: unknown) => toast.error(errorMessage(e)), onSuccess: fn });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="t-h1">Chat</h1>
          <p className="text-ink-muted">{isLive ? 'Every message is saved. Use History to switch between app chats and WhatsApp Messenger.' : 'One conversation in the app and by text. Every message is saved.'}</p>
        </div>
        <div className="flex items-center gap-2">
        {isLive && <ChatHistoryMenu conversations={conversations} activeId={activeId} onSelect={setSelected} onNew={() => setSelected('new')} />}
        <Button variant="secondary" disabled={transcript.isPending || messages.length === 0} onClick={() => transcript.mutate(undefined, actError(() => toast.success(`Transcript sent to ${snap.user.email}`)))}>
          <Mail aria-hidden className="size-4" />{transcript.isPending ? 'Sending…' : 'Email transcript'}
        </Button>
        </div>
      </header>

      <Panel className="flex h-[calc(100dvh-21rem)] min-h-[400px] flex-col overflow-hidden lg:h-[calc(100dvh-13rem)] lg:min-h-[460px]" aria-label="Conversation">
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto bg-canvas/60 p-4 md:p-6" aria-live="polite">
          {messages.length === 0 && !working && !sending ? (
            <div className="m-auto flex max-w-md flex-col items-center gap-4 text-center">
              <span aria-hidden className="inline-block size-10 rounded-[12px] bg-brand" />
              <h2 className="t-h2">Ask Floss about your plan</h2>
              <p className="text-ink-muted">What a procedure will cost, what’s covered, or how much of your annual maximum is left. Floss uses your plan and your dentist’s quote, and never guesses a price.</p>
            </div>
          ) : (
            [...messages, ...(sending && !activeId ? [{ id: 'sending', role: 'user', channel: 'app', text: sending, cards: [], createdAt: new Date().toISOString() } satisfies Message] : [])].map((m) => <ChatMessage key={m.id} message={m} snapshot={snap} busy={confirm.isPending || cancel.isPending} onConfirm={(id) => confirm.mutate(id, { onError: (e) => toast.error(errorMessage(e)) })} onCancel={(id) => cancel.mutate(id)} />)
          )}
          {(working || send.isPending) && <Typing />}
          <div ref={endRef} />
        </div>

        {readOnly ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface p-4">
            <p className="t-small text-ink-muted">This chat happened in WhatsApp Messenger. Reply there, or start a new chat here.</p>
            <Button size="sm" onClick={() => setSelected('new')}><Plus aria-hidden className="size-4" />New chat</Button>
          </div>
        ) : (
        <div className="flex flex-col gap-3 border-t border-line bg-surface p-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {suggestions.map((s) => (
              <button key={s} type="button" disabled={working} onClick={() => submit(s)} className="shrink-0 rounded-full border border-line-strong px-3 py-1.5 t-small-strong text-ink transition-colors hover:bg-surface-2 disabled:opacity-50">{s}</button>
            ))}
          </div>
          <div className={cn('flex items-end gap-3 rounded-lg border border-line-strong bg-surface p-2 pl-4 focus-within:border-brand')}>
            <label htmlFor="chat-input" className="sr-only">Message Floss</label>
            <textarea id="chat-input" ref={inputRef} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="Ask about a procedure, a cost, or your plan" className="max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2 text-base outline-none placeholder:text-ink-muted" />
            <Button aria-label="Send message" onClick={() => submit()} disabled={!text.trim() || working || send.isPending} className="size-11 !px-0"><Send aria-hidden className="size-5" /></Button>
          </div>
        </div>
        )}
      </Panel>
    </div>
  );
}
