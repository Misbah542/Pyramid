import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('panel rounded-lg shadow-panel', className)}>{children}</section>;
}

export function PanelHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn('flex items-center justify-between gap-2 border-b border-line px-3 py-2.5', className)}
    >
      <div className="flex min-w-0 items-center gap-2">
        {icon ? <span className="shrink-0 text-faint">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="truncate text-xs font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle ? <p className="truncate text-2xs text-faint">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}>{children}</div>;
}
