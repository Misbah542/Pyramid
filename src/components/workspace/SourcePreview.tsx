/**
 * Source preview.
 *
 * Repository source is untrusted content: it is fetched through the RepoVerse
 * API, tokenised locally and rendered as React text nodes. Nothing is ever
 * inserted as HTML and nothing is executed. Large files are truncated by the
 * server rather than streamed in full.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, FileWarning, Loader2 } from 'lucide-react';
import type { AnalysisError } from '@shared/graph';
import { languageLabel } from '@shared/language';
import { fetchSource } from '@/lib/api';
import { highlight, TOKEN_CLASS } from '@/lib/highlight';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';

export interface SourcePreviewProps {
  repo: string;
  gitRef: string | null;
  path: string;
  language: string | null;
  /** Demo graphs have no real file behind them. */
  available: boolean;
  githubUrl: string | null;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; error: AnalysisError }
  | { kind: 'loaded'; content: string; truncated: boolean };

const COLLAPSED_LINES = 24;

export function SourcePreview({ repo, gitRef, path, language, available, githubUrl }: SourcePreviewProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setStatus({ kind: 'idle' });
    setExpanded(false);
  }, [repo, gitRef, path]);

  const load = async () => {
    if (!gitRef) return;
    setStatus({ kind: 'loading' });
    try {
      const file = await fetchSource(repo, gitRef, path);
      setStatus({ kind: 'loaded', content: file.content, truncated: file.truncated });
    } catch (error) {
      const analysisError =
        error && typeof error === 'object' && 'analysisError' in error
          ? ((error as { analysisError: AnalysisError }).analysisError)
          : { code: 'server-error' as const, message: 'Could not read that file.' };
      setStatus({ kind: 'error', error: analysisError });
    }
  };

  const lines = useMemo(() => {
    if (status.kind !== 'loaded') return [];
    return highlight(status.content, language, 2000);
  }, [status, language]);

  if (!available || !gitRef) {
    return (
      <EmptyState
        compact
        icon={<FileWarning className="h-4 w-4" />}
        title="No source available"
        description={
          available
            ? 'This graph has no commit reference, so file contents cannot be fetched.'
            : 'Demo repository files are structural stand-ins — there is no file to read. Analyse a real repository to preview source.'
        }
      />
    );
  }

  if (status.kind === 'idle') {
    return (
      <div className="px-3 py-3">
        <Button size="sm" variant="outline" onClick={load} className="w-full">
          Load source preview
        </Button>
        <p className="pt-1.5 text-2xs leading-snug text-faint">
          Fetched on demand so an analysis never downloads the whole repository.
        </p>
      </div>
    );
  }

  if (status.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-xs text-faint">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Reading {path.split('/').pop()}…
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="px-3 py-3">
        <p className="text-xs text-danger">{status.error.message}</p>
        {status.error.detail ? <p className="pt-1 text-2xs text-faint">{status.error.detail}</p> : null}
        <Button size="sm" variant="outline" onClick={load} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  const shown = expanded ? lines : lines.slice(0, COLLAPSED_LINES);
  const gutterWidth = `${String(lines.length).length + 1}ch`;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="truncate font-mono text-2xs text-faint" title={path}>
          {path}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <span className="chip">{languageLabel(language)}</span>
          <button
            type="button"
            title="Copy path"
            aria-label="Copy file path"
            onClick={() => {
              void navigator.clipboard?.writeText(path);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
            className="rounded-xs p-1 text-faint transition-colors hover:text-ink"
          >
            {copied ? <Check className="h-3 w-3 text-positive" /> : <Copy className="h-3 w-3" />}
          </button>
          {githubUrl ? (
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer noopener"
              title="Open on GitHub"
              className="rounded-xs p-1 text-faint transition-colors hover:text-ink"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>

      <div className={cn('overflow-auto bg-base/50', expanded ? 'max-h-[46vh]' : 'max-h-[16rem]')}>
        <pre className="w-max min-w-full py-2 font-mono text-[0.6875rem] leading-[1.55]">
          <code>
            {shown.map((line) => (
              <div key={line.number} className="flex px-3 hover:bg-elevated/40">
                <span
                  className="mr-3 shrink-0 select-none text-right text-faint/70"
                  style={{ width: gutterWidth }}
                  aria-hidden
                >
                  {line.number}
                </span>
                <span className="whitespace-pre">
                  {line.tokens.length === 0 ? ' ' : null}
                  {line.tokens.map((token, tokenIndex) => (
                    <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
                      {token.text}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5">
        <span className="font-mono text-2xs text-faint">
          {lines.length.toLocaleString('en-US')} lines
          {status.truncated ? ` · truncated at ${formatBytes(status.content.length)}` : ''}
        </span>
        {lines.length > COLLAPSED_LINES ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-2xs text-accent hover:underline"
          >
            {expanded ? 'Collapse' : `Show all ${lines.length.toLocaleString('en-US')} lines`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
