import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  iconLeft?: ReactNode;
  addon?: ReactNode;
  invalid?: boolean;
  sizing?: 'sm' | 'md' | 'lg';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { iconLeft, addon, invalid, sizing = 'md', className, ...props },
  ref,
) {
  const heights = { sm: 'h-8 text-xs', md: 'h-10 text-sm', lg: 'h-12 text-[0.9375rem]' } as const;
  return (
    <div
      className={cn(
        'group relative flex w-full items-center gap-2 rounded-lg border bg-surface/70 px-3 transition-colors duration-fast',
        'focus-within:border-accent/70 focus-within:shadow-glow',
        invalid ? 'border-danger/60' : 'border-line hover:border-line-strong',
        heights[sizing],
        className,
      )}
    >
      {iconLeft ? <span className="shrink-0 text-faint transition-colors group-focus-within:text-accent">{iconLeft}</span> : null}
      <input
        ref={ref}
        className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint/80"
        {...props}
      />
      {addon}
    </div>
  );
});
