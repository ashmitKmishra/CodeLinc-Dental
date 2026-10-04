import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-lg border border-line bg-surface', className)} {...props} />;
}

export function PanelHeader({ title, icon, right, className }: { title: ReactNode; icon?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4', className)}>
      {icon}
      <h2 className="t-h3 text-ink">{title}</h2>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </header>
  );
}

export const Divided = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn('border-t border-line', className)} {...props} />;
