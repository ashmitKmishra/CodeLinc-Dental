import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const control = 'h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-ink transition-colors hover:border-ink-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand aria-[invalid=true]:border-bad';

export function FieldShell({ label, helper, error, id, children, className }: { label: string; helper?: ReactNode; error?: string; id: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="t-small-strong text-ink">{label}</label>
      {children}
      {error ? <p id={`${id}-msg`} role="alert" className="t-small text-bad">{error}</p> : helper ? <p id={`${id}-msg`} className="t-small text-ink-muted">{helper}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; helper?: ReactNode; error?: string; prefix?: string }>(
  ({ label, helper, error, prefix, className, id, ...props }, ref) => {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <FieldShell label={label} helper={helper} error={error} id={fid} className={className}>
        <div className="relative">
          {prefix && <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">{prefix}</span>}
          <input ref={ref} id={fid} aria-invalid={!!error} aria-describedby={error || helper ? `${fid}-msg` : undefined} className={cn(control, prefix && 'pl-7')} {...props} />
        </div>
      </FieldShell>
    );
  },
);
Input.displayName = 'Input';

export function Select({ label, helper, className, id, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; helper?: ReactNode }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} helper={helper} id={fid} className={className}>
      <div className="relative">
        <select id={fid} className={cn(control, 'appearance-none pr-10')} {...props}>{children}</select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
      </div>
    </FieldShell>
  );
}
