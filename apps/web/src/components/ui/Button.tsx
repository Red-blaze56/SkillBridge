import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.ts';

type Variant = 'primary' | 'secondary' | 'ghost';

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variants: Record<Variant, string> = {
    primary: 'border-ink bg-ink text-paper hover:opacity-90',
    secondary: 'border-line bg-transparent text-ink hover:border-ink',
    ghost: 'border-transparent bg-transparent text-muted hover:text-ink',
  };

  return (
    <button
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 border px-5 py-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
