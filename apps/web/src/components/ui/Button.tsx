import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'onShell' | 'onShellOutline' | 'accent' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'lg';

const base = 'inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 ease-out-expo active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:pointer-events-none';
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'text-brand hover:bg-brand-soft',
  danger: 'bg-bad text-white hover:brightness-110',
  accent: 'bg-accent text-shell hover:brightness-95',
  onShell: 'bg-shell-ink text-shell hover:bg-white',
  onShellOutline: 'border border-shell-muted/60 text-shell-ink hover:bg-shell-active',
};
const sizes: Record<ButtonSize, string> = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-base', lg: 'h-12 px-6 text-base' };

export const buttonStyles = ({ variant = 'primary', size = 'md', className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) =>
  cn(base, variants[variant], sizes[size], className);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; size?: ButtonSize }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant, size, className, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={buttonStyles({ variant, size, className })} {...props} />
));
Button.displayName = 'Button';
