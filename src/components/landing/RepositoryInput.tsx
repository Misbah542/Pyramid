/**
 * Repository URL input.
 *
 * Validates the URL shape in the browser for instant feedback; the server
 * re-validates before it fetches anything, because the client check is a
 * convenience, not a security boundary.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Github, Info, Loader2, Play } from 'lucide-react';
import { parseRepositoryUrl } from '@shared/repo-url';
import { fetchHealth, type ServiceHealth } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';

export function RepositoryInput({ autoFocus }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [health, setHealth] = useState<ServiceHealth | null | 'unknown'>('unknown');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchHealth().then(setHealth);
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseRepositoryUrl(value);
    if (!parsed.ok) {
      setError(parsed.message);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    const search = new URLSearchParams({ repo: parsed.value.fullName });
    if (parsed.value.ref) search.set('ref', parsed.value.ref);
    navigate(`/analyze?${search.toString()}`);
  };

  const apiDown = health === null;

  return (
    <div className="w-full">
      <form onSubmit={submit} noValidate>
        <div
          className={cn(
            'flex flex-col gap-2 rounded-xl border bg-surface/80 p-2 shadow-panel backdrop-blur-xl transition-colors sm:flex-row sm:items-center',
            error ? 'border-danger/50' : 'border-line focus-within:border-accent/60',
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5">
            <Github className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError(null);
              }}
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={submitting}
              aria-label="Public GitHub repository URL"
              aria-invalid={Boolean(error)}
              aria-describedby="repo-input-hint"
              placeholder="https://github.com/owner/repository"
              className="h-11 min-w-0 flex-1 bg-transparent font-mono text-sm text-ink outline-none placeholder:text-faint/70"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            variant="primary"
            disabled={submitting || value.trim().length === 0}
            loading={submitting}
            iconRight={submitting ? undefined : <ArrowRight className="h-4 w-4" />}
            className="shrink-0"
          >
            {submitting ? 'Starting analysis' : 'Visualize Repository'}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pt-2.5">
        <p id="repo-input-hint" className={cn('text-2xs', error ? 'text-danger' : 'text-faint')}>
          {error ?? 'Public GitHub repositories only. Nothing is written to your repository, and no sign-in is required.'}
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          iconLeft={<Play className="h-3 w-3" />}
          onClick={() => navigate('/workspace?demo=1')}
        >
          View Demo
        </Button>
      </div>

      {apiDown ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-warning/25 bg-warning/[0.05] px-2.5 py-2 text-2xs leading-snug text-warning">
          <Info className="mt-px h-3 w-3 shrink-0" />
          The analysis API is not responding, so live repository analysis will fail. The demo workspace runs entirely in
          the browser and still works.
        </p>
      ) : null}

      {health && health !== 'unknown' && !health.tokenConfigured ? (
        <p className="mt-2 flex items-start gap-1.5 px-1 text-2xs leading-snug text-faint">
          <Info className="mt-px h-3 w-3 shrink-0" />
          The server is running without a GitHub token, so GitHub allows 60 requests per hour. Large repositories may hit
          that limit.
        </p>
      ) : null}

      {health === 'unknown' ? (
        <p className="mt-2 flex items-center gap-1.5 px-1 text-2xs text-faint">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking the analysis service…
        </p>
      ) : null}
    </div>
  );
}
