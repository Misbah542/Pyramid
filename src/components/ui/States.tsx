import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, WifiOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center animate-fade-in',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-elevated/60 text-faint">
        {icon ?? <Inbox className="h-4 w-4" />}
      </div>
      <div className="max-w-xs space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description ? <p className="text-xs leading-relaxed text-faint">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  detail,
  onRetry,
  retryLabel = 'Try again',
  icon,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('rounded-lg border border-danger/25 bg-danger/[0.04] p-5 animate-fade-in', className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-danger/25 bg-danger/10 text-danger">
          {icon ?? <AlertTriangle className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium text-ink">{title}</p>
          {description ? <div className="text-xs leading-relaxed text-muted">{description}</div> : null}
          {detail ? (
            <p className="break-words font-mono text-2xs leading-relaxed text-faint">{detail}</p>
          ) : null}
          {children}
          {onRetry ? (
            <div className="pt-1.5">
              <Button size="sm" variant="outline" onClick={onRetry}>
                {retryLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      icon={<WifiOff className="h-4 w-4" />}
      title="Cannot reach the analysis service"
      description="The RepoVerse API did not respond. If you are running locally, check that the API process is up."
      detail="npm run dev starts both the web app and the API."
      onRetry={onRetry}
    />
  );
}
