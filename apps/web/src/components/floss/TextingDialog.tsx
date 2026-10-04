import { useState } from 'react';
import type { Messaging } from '@floss/contracts';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Feedback';
import { api } from '@/lib/api';
import { errorMessage, useAction } from '@/lib/hooks';

const statusLabel: Record<Messaging['status'], string> = { unlinked: 'Not linked', awaiting_text: 'Waiting for your text', awaiting_confirmation: 'Almost there', linked: 'Linked', opted_out: 'Stopped' };

export function TextingDialog({ open, onClose, messaging }: { open: boolean; onClose: () => void; messaging: Messaging }) {
  const [link, setLink] = useState<{ code: string; flossNumber: string } | null>(null);
  const getCode = useAction(() => api.createLinkCode().then((r) => setLink(r)));
  const unlink = useAction(() => api.unlinkPhone().then(() => setLink(null)));
  const joinText = link ? `JOIN ${link.code}` : '';
  const liveLinked = messaging.status === 'linked' && messaging.mode === 'live';
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success('Copied'); } catch { toast.error('Couldn’t copy. Select the text and copy it instead.'); } };

  return (
    <Dialog open={open} onClose={onClose} title={liveLinked ? 'WhatsApp' : 'Texting'}>
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-2"><Chip tone={messaging.status === 'linked' ? 'ok' : 'neutral'}>{liveLinked ? 'Connected' : statusLabel[messaging.status]}</Chip></div>

        {liveLinked ? (
          <div className="flex flex-col gap-3">
            <p className="t-body-strong">Connected to {messaging.maskedPhone}</p>
            <p className="text-ink-muted">Your account uses the number you signed in with, so there is nothing to link. Message Floss on WhatsApp from that number and the same conversation appears in Chat, under History.</p>
          </div>
        ) : messaging.status === 'linked' ? (
          <>
            <div className="flex flex-col gap-1">
              <p className="t-body-strong">Linked to {messaging.maskedPhone}</p>
              <p className="t-small text-ink-muted">Text your questions and Floss answers by message. It’s the same conversation as the app.</p>
            </div>
            <p className="t-small text-ink-muted">Reply <span className="t-mono text-ink">STOP</span> anytime to stop texts, <span className="t-mono text-ink">HELP</span> for help, and <span className="t-mono text-ink">CONFIRM</span> plus a code to approve a change.</p>
            <Button variant="secondary" className="w-fit" onClick={() => unlink.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })} disabled={unlink.isPending}>Unlink my phone</Button>
          </>
        ) : messaging.status === 'awaiting_text' && link ? (
          <>
            <p>Text this from your phone to <span className="t-body-strong">{link.flossNumber}</span>:</p>
            <div className="flex items-center gap-3 rounded-md bg-brand-soft p-4">
              <span className="flex-1 font-mono text-2xl font-medium tracking-wide text-brand" aria-label={`Text ${joinText}`}>{joinText}</span>
              <Button variant="secondary" size="sm" onClick={() => void copy(joinText)}><Copy aria-hidden className="size-4" />Copy</Button>
            </div>
            <p className="flex items-center gap-2 t-small text-ink-muted"><Spinner className="size-4" />Waiting for your text. The code works for 30 minutes.</p>
            {api.dev && <Button variant="ghost" size="sm" className="w-fit" onClick={() => api.dev!.simulateText()}>Demo: pretend I sent the text</Button>}
            <p className="t-small text-ink-muted">Standard message rates may apply. Floss texts only about your plan, and never after you reply STOP.</p>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="t-body-strong">Your AI buddy, one text away</p>
              <p className="text-ink-muted">Link your number to ask Floss questions by text, with no app to open. Every message is saved in your chat here too.</p>
            </div>
            <Button className="w-fit" onClick={() => getCode.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })} disabled={getCode.isPending}>{getCode.isPending ? 'Getting a code…' : messaging.status === 'awaiting_text' ? 'Get a new code' : 'Get a code'}</Button>
          </>
        )}
        {messaging.mode === 'simulated' && !liveLinked && <p className="border-t border-line pt-4 t-small text-ink-muted">Texting is simulated in this demo. No real messages are sent.</p>}
      </div>
    </Dialog>
  );
}
