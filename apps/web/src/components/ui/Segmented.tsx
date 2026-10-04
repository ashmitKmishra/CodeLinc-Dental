import { cn } from '@/lib/cn';

export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-md bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('h-9 rounded-sm px-3 t-small-strong transition-colors', value === o.value ? 'bg-surface text-ink shadow-e1' : 'text-ink-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
