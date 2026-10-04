import { cn } from '@/lib/cn';

/** Member color follows their position in the household, so it's stable across screens. */
export function Avatar({ name, index, size = 32, className }: { name: string; index: number; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-on-brand', className)}
      style={{ width: size, height: size, backgroundColor: `var(--color-member-${index % 4})`, fontSize: size * 0.42 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
