import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'positive' | 'warning' | 'danger';
  className?: string;
}) {
  const tones = {
    neutral: 'border-line bg-elevated/70 text-muted',
    accent: 'border-accent/35 bg-accent/12 text-accent',
    positive: 'border-positive/30 bg-positive/10 text-positive',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    danger: 'border-danger/30 bg-danger/10 text-danger',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-2xs font-medium leading-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-xs border border-line bg-elevated px-1 font-mono text-[0.625rem] text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-sm bg-elevated/80', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start justify-between gap-3 py-1.5',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="min-w-0">
        <span className="block text-xs text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-2xs leading-snug text-faint">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-4 w-7 shrink-0 rounded-full border transition-colors duration-fast',
          checked ? 'border-accent/60 bg-accent/80' : 'border-line-strong bg-elevated',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white transition-transform duration-fast ease-out',
            checked ? 'translate-x-[0.875rem]' : 'translate-x-[0.1875rem]',
          )}
        />
      </button>
    </label>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-md border border-line bg-elevated/60 p-0.5', className)} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          title={option.title}
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-sm font-medium transition-colors duration-fast',
            size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
            value === option.value ? 'bg-surface text-ink shadow-sm' : 'text-faint hover:text-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Tooltip({
  children,
  content,
  side = 'bottom',
  className,
}: {
  children: ReactNode;
  content: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  return (
    <span className={cn('group/tooltip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-overlay w-max max-w-[18rem] -translate-x-1/2 scale-95 rounded-sm border border-line bg-overlay px-2 py-1 text-2xs text-muted opacity-0 shadow-pop transition-[opacity,transform] duration-fast',
          'group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100 group-focus-within/tooltip:scale-100 group-focus-within/tooltip:opacity-100',
          side === 'bottom' ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]',
        )}
      >
        {content}
      </span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-md border border-line bg-elevated/40 px-3 py-2.5', className)}>
      <div className="text-2xs uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 font-mono text-sm text-ink">{value}</div>
      {hint ? <div className="mt-1 text-2xs leading-snug text-faint">{hint}</div> : null}
    </div>
  );
}

export function SectionLabel({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-3 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-faint', className)}
      {...props}
    >
      {children}
    </div>
  );
}
