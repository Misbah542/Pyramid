import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white shadow-glow hover:brightness-110 active:brightness-95 disabled:bg-accent/40 disabled:shadow-none',
  secondary: 'bg-elevated text-ink border border-line hover:border-line-strong hover:bg-elevated/70',
  ghost: 'text-muted hover:text-ink hover:bg-elevated/70',
  outline: 'border border-line-strong text-ink hover:bg-elevated/60',
  danger: 'bg-danger/90 text-white hover:bg-danger',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-2xs gap-1.5 rounded-sm',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg font-medium',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', iconLeft, iconRight, loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-out',
        'active:translate-y-px disabled:pointer-events-none disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : iconLeft}
      {children}
      {iconRight}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: Variant;
  size?: 'sm' | 'md';
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', active, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-sm transition-colors duration-fast',
        size === 'sm' ? 'h-6 w-6' : 'h-8 w-8',
        active ? 'bg-accent/15 text-accent' : VARIANTS[variant],
        'disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      aria-hidden
    />
  );
}
