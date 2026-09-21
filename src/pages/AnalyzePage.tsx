/**
 * Analysis progress.
 *
 * Stages come from the server as they actually complete — there is no
 * simulated percentage here. The last two stages (spatial layout, preparing the
 * scene) happen in the browser and are reported from the layout worker.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Boxes,
  Check,
  CircleSlash,
  Clock,
  FileQuestion,
  Github,
  Loader2,
  Lock,
  ScanSearch,
  ShieldAlert,
  Timer,
  TriangleAlert,
  WifiOff,
} from 'lucide-react';
import type { AnalysisError, AnalysisStage, AnalysisWarning, RepositoryInfo } from '@shared/graph';
import { ANALYSIS_STAGES, STAGE_LABELS } from '@shared/graph';
import { parseFullName } from '@shared/repo-url';
import { cn } from '@/lib/cn';
import { streamAnalysis, type StreamHandle } from '@/lib/api';
import { formatCount } from '@/lib/format';
import { createDemoGraph } from '@/demo/demo-graph';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Primitives';
import { RepoVerseMark } from '@/components/RepoVerseMark';

type StageState = 'waiting' | 'active' | 'done';

const CLIENT_STAGES = new Set<AnalysisStage>(['layout', 'ready']);

export default function AnalyzePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const repo = params.get('repo') ?? '';
  const ref = params.get('ref') ?? undefined;

  const loadGraph = useWorkspaceStore((state) => state.loadGraph);
  const layoutPending = useWorkspaceStore((state) => state.layoutPending);

  const [stages, setStages] = useState<Record<AnalysisStage, StageState>>(() => initialStages());
  const [details, setDetails] = useState<Partial<Record<AnalysisStage, string>>>({});
  const [repository, setRepository] = useState<RepositoryInfo | null>(null);
  const [warnings, setWarnings] = useState<AnalysisWarning[]>([]);
  const [error, setError] = useState<AnalysisError | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [graphReady, setGraphReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const handle = useRef<StreamHandle | null>(null);
  const parsed = useMemo(() => parseFullName(repo), [repo]);

  const reset = useCallback(() => {
    setStages(initialStages());
    setDetails({});
    setWarnings([]);
    setError(null);
    setCancelled(false);
    setGraphReady(false);
  }, []);

  useEffect(() => {
    if (!parsed.ok) {
      setError({ code: 'invalid-url', message: parsed.message });
      return;
    }

    reset();
    const stream = streamAnalysis(parsed.value.fullName, ref, {
      onEvent: (event) => {
        if (event.type === 'stage') {
          setStages((current) => ({ ...current, [event.stage]: event.state === 'done' ? 'done' : 'active' }));
          if (event.detail) setDetails((current) => ({ ...current, [event.stage]: event.detail }));
        } else if (event.type === 'repository') {
          setRepository(event.repository);
        } else if (event.type === 'warning') {
          setWarnings((current) => [...current, event.warning]);
        }
      },
      onDone: (graph) => {
        setRepository(graph.repository);
        setStages((current) => ({ ...current, layout: 'active' }));
        loadGraph(graph, 'live');
        setGraphReady(true);
      },
      onError: (analysisError) => setError(analysisError),
    });

    handle.current = stream;
    return () => stream.cancel();
  }, [parsed, ref, reset, loadGraph, attempt]);

  /* The browser-side stages report from the layout worker. */
  useEffect(() => {
    if (!graphReady) return;
    if (layoutPending) {
      setStages((current) => ({ ...current, layout: 'active' }));
      return;
    }
    setStages((current) => ({ ...current, layout: 'done', ready: 'done' }));
    const timer = window.setTimeout(() => {
      const search = new URLSearchParams({ repo });
      if (ref) search.set('ref', ref);
      navigate(`/workspace?${search.toString()}`, { replace: true });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [graphReady, layoutPending, navigate, repo, ref]);

  const cancel = () => {
    handle.current?.cancel();
    setCancelled(true);
  };

  const retry = () => {
    setAttempt((value) => value + 1);
  };

  return (
    <div className="relative flex min-h-dvh flex-col bg-base bg-spatial">
      <header className="flex items-center justify-between px-5 py-4">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          <RepoVerseMark className="h-5 w-5" />
          RepoVerse
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Analyse a different repository
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 pb-16">
        <RepositoryHeader repo={repo} repository={repository} />

        {error ? (
          <AnalysisErrorCard error={error} repo={repo} onRetry={retry} />
        ) : cancelled ? (
          <div className="mt-6 rounded-lg border border-line bg-surface/70 p-5">
            <div className="flex items-center gap-2 text-sm text-ink">
              <Ban className="h-4 w-4 text-muted" />
              Analysis cancelled
            </div>
            <p className="pt-1.5 text-xs leading-relaxed text-muted">
              Nothing was kept. You can start again — files already fetched are cached on the server for a few minutes,
              so a second run is usually faster.
            </p>
            <div className="flex gap-2 pt-3">
              <Button size="sm" variant="primary" onClick={retry}>
                Run again
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
                Back to home
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ol className="mt-6 space-y-0.5 rounded-lg border border-line bg-surface/60 p-2 backdrop-blur-xl">
              {ANALYSIS_STAGES.map((stage) => (
                <StageRow
                  key={stage}
                  stage={stage}
                  state={stages[stage]}
                  detail={details[stage]}
                  clientSide={CLIENT_STAGES.has(stage)}
                />
              ))}
            </ol>

            <div className="flex items-center justify-between gap-3 pt-3">
              <p className="text-2xs leading-relaxed text-faint">
                Stages complete as the work finishes — nothing here is a simulated percentage.
              </p>
              <Button size="sm" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {warnings.length > 0 && !error ? (
          <section className="mt-4 rounded-lg border border-warning/25 bg-warning/[0.05] p-3">
            <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-warning">
              <TriangleAlert className="h-3 w-3" />
              Analysis notes
            </h2>
            <ul className="space-y-1.5 pt-2">
              {warnings.map((warning, position) => (
                <li key={`${warning.code}-${position}`}>
                  <p className="text-xs leading-snug text-ink">{warning.message}</p>
                  {warning.detail ? <p className="text-2xs leading-snug text-faint">{warning.detail}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function initialStages(): Record<AnalysisStage, StageState> {
  return ANALYSIS_STAGES.reduce(
    (accumulator, stage) => {
      accumulator[stage] = 'waiting';
      return accumulator;
    },
    {} as Record<AnalysisStage, StageState>,
  );
}

function RepositoryHeader({ repo, repository }: { repo: string; repository: RepositoryInfo | null }) {
  return (
    <div className="rounded-lg border border-line bg-surface/70 p-5 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-elevated/70">
          <Boxes className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-mono text-base text-ink">{repository?.fullName ?? repo}</h1>
          <p className="truncate text-xs text-faint">
            {repository ? (
              <>
                {repository.owner} · branch{' '}
                <span className="font-mono text-muted">{repository.branch}</span>
                {repository.defaultBranch && repository.branch !== repository.defaultBranch
                  ? ` (default: ${repository.defaultBranch})`
                  : ''}
              </>
            ) : (
              'Resolving repository…'
            )}
          </p>
          {repository?.description ? (
            <p className="line-clamp-2 pt-1.5 text-xs leading-relaxed text-muted">{repository.description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5 pt-2.5">
            {repository?.primaryLanguage ? <Badge tone="accent">{repository.primaryLanguage}</Badge> : null}
            {repository?.sizeKb ? <Badge>{formatCount(Math.round(repository.sizeKb / 1024))} MB</Badge> : null}
            {repository?.stars !== null && repository?.stars !== undefined ? (
              <Badge>{formatCount(repository.stars)} stars</Badge>
            ) : null}
            {repository?.url ? (
              <a
                href={repository.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-2xs text-muted transition-colors hover:text-ink"
              >
                <Github className="h-3 w-3" />
                View on GitHub
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StageRow({
  stage,
  state,
  detail,
  clientSide,
}: {
  stage: AnalysisStage;
  state: StageState;
  detail?: string;
  clientSide: boolean;
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors duration-base',
        state === 'active' && 'bg-accent/[0.07]',
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {state === 'done' ? (
          <Check className="h-3.5 w-3.5 text-positive" />
        ) : state === 'active' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
        )}
      </span>
      <span className={cn('flex-1 text-xs', state === 'waiting' ? 'text-faint' : 'text-ink')}>
        {STAGE_LABELS[stage]}
        {clientSide ? <span className="pl-1.5 text-2xs text-faint">in browser</span> : null}
      </span>
      {detail ? <span className="shrink-0 font-mono text-2xs text-muted">{detail}</span> : null}
    </li>
  );
}

const ERROR_PRESENTATION: Record<
  AnalysisError['code'],
  { title: string; icon: typeof ShieldAlert; hint: string }
> = {
  'invalid-url': {
    title: 'That is not a GitHub repository URL',
    icon: CircleSlash,
    hint: 'RepoVerse accepts github.com URLs, or a plain owner/repository pair.',
  },
  'not-found': {
    title: 'Repository not found',
    icon: FileQuestion,
    hint: 'Check the spelling. If the repository is private, RepoVerse cannot read it — only public repositories can be analysed.',
  },
  'private-repository': {
    title: 'That repository is not public',
    icon: Lock,
    hint: 'RepoVerse only reads public repositories, and never asks for repository credentials.',
  },
  'rate-limited': {
    title: 'GitHub rate limit reached',
    icon: Timer,
    hint: 'Unauthenticated GitHub requests are capped per hour. Wait for the reset, or configure a GITHUB_TOKEN on the server.',
  },
  'too-large': {
    title: 'Repository is too large to analyse',
    icon: ShieldAlert,
    hint: 'Very large repositories exceed the analysis budget. Try a smaller repository, or raise the limits in the server config.',
  },
  'no-supported-sources': {
    title: 'No analysable source files found',
    icon: ScanSearch,
    hint: 'The repository may contain only documentation, assets or binaries, or its languages are not yet supported.',
  },
  'empty-repository': {
    title: 'This repository is empty',
    icon: FileQuestion,
    hint: 'There are no files on this branch to map.',
  },
  network: {
    title: 'Could not reach GitHub',
    icon: WifiOff,
    hint: 'The analysis service could not complete its request. Check connectivity and try again.',
  },
  timeout: {
    title: 'Analysis timed out',
    icon: Clock,
    hint: 'The repository took longer than the time budget. Re-running often gets further, because fetched files are cached.',
  },
  'server-error': {
    title: 'The analysis failed',
    icon: TriangleAlert,
    hint: 'Something went wrong inside the analysis service.',
  },
};

function AnalysisErrorCard({
  error,
  repo,
  onRetry,
}: {
  error: AnalysisError;
  repo: string;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const loadGraph = useWorkspaceStore((state) => state.loadGraph);
  const presentation = ERROR_PRESENTATION[error.code] ?? ERROR_PRESENTATION['server-error'];
  const Icon = presentation.icon;

  const resetsIn = error.retryAt ? Math.max(0, Math.round((error.retryAt * 1000 - Date.now()) / 60_000)) : null;

  return (
    <section className="mt-6 rounded-lg border border-danger/25 bg-danger/[0.04] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-danger/25 bg-danger/10 text-danger">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-ink">{presentation.title}</h2>
          <p className="pt-1 text-xs leading-relaxed text-muted">{error.message}</p>
          {error.detail ? <p className="pt-1 text-2xs leading-relaxed text-faint">{error.detail}</p> : null}
          <p className="pt-2 text-2xs leading-relaxed text-faint">{presentation.hint}</p>
          {resetsIn !== null ? (
            <p className="pt-1 text-2xs text-warning">
              The limit resets in about {resetsIn} {resetsIn === 1 ? 'minute' : 'minutes'}.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-3.5">
            {error.code !== 'invalid-url' ? (
              <Button size="sm" variant="primary" onClick={onRetry}>
                Try again
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                loadGraph(createDemoGraph(), 'demo');
                navigate('/workspace?demo=1');
              }}
            >
              Explore the demo instead
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
              Change repository
            </Button>
            {repo && error.code === 'not-found' ? (
              <a
                href={`https://github.com/${repo}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-2xs text-muted transition-colors hover:text-ink"
              >
                <Github className="h-3 w-3" />
                Check on GitHub
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
