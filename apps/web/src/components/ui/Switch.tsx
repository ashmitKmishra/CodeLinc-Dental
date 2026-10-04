import { cn } from '@/lib/cn';

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50', checked ? 'bg-brand' : 'bg-line-strong')}
    >
      <span className={cn('absolute left-0.5 top-0.5 size-5 rounded-full bg-surface shadow-e1 transition-transform duration-150 ease-out-expo', checked && 'translate-x-4')} />
    </button>
  );
}
