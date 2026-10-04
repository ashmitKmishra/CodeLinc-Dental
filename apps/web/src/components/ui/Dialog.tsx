import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Modal built on the native <dialog>: focus is trapped, Esc closes, and the page behind is inert. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref} aria-labelledby={titleId} onClose={onClose}
      onMouseDown={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-auto w-[min(92vw,520px)] max-h-[88vh] overflow-hidden rounded-xl border border-line bg-surface p-0 shadow-e3"
    >
      {open && (
        <div className="flex max-h-[88vh] flex-col">
          <header className="flex items-center gap-3 border-b border-line px-5 py-4">
            <h2 id={titleId} className="t-h3 flex-1">{title}</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-sm p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink"><X aria-hidden className="size-5" /></button>
          </header>
          <div className="overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  );
}
