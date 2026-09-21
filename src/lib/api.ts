/**
 * Client for the RepoVerse analysis API.
 *
 * The browser never talks to GitHub directly — all repository access happens
 * server-side, which is what keeps any token out of the client bundle.
 */

import type { AnalysisError, AnalysisEvent, RepositoryGraph, RepositoryInfo } from '@shared/graph';

const API_BASE = '/api';

export interface StreamHandlers {
  onEvent: (event: AnalysisEvent) => void;
  onDone: (graph: RepositoryGraph) => void;
  onError: (error: AnalysisError) => void;
}

export interface StreamHandle {
  cancel: () => void;
}

/**
 * Subscribes to a live analysis. Progress arrives as real stage transitions
 * from the server; nothing here invents intermediate percentages.
 */
export function streamAnalysis(repo: string, ref: string | undefined, handlers: StreamHandlers): StreamHandle {
  const params = new URLSearchParams({ repo });
  if (ref) params.set('ref', ref);

  const source = new EventSource(`${API_BASE}/analyze/stream?${params.toString()}`);
  let settled = false;

  const close = () => {
    settled = true;
    source.close();
  };

  source.onmessage = (message) => {
    let event: AnalysisEvent;
    try {
      event = JSON.parse(message.data) as AnalysisEvent;
    } catch {
      return;
    }
    handlers.onEvent(event);
    if (event.type === 'result') {
      close();
      handlers.onDone(event.graph);
    } else if (event.type === 'error') {
      close();
      handlers.onError(event.error);
    }
  };

  source.onerror = () => {
    if (settled) return;
    close();
    handlers.onError({
      code: 'network',
      message: 'Lost the connection to the analysis service.',
      detail: 'Check that the RepoVerse API is running, then try again.',
    });
  };

  return { cancel: close };
}

export interface SourceFile {
  path: string;
  content: string;
  truncated: boolean;
  language: string | null;
}

export async function fetchSource(repo: string, ref: string, path: string): Promise<SourceFile> {
  const params = new URLSearchParams({ repo, ref, path });
  const response = await fetch(`${API_BASE}/source?${params.toString()}`);
  const body = (await response.json()) as SourceFile | { error: AnalysisError };
  if (!response.ok || 'error' in body) {
    const error = 'error' in body ? body.error : { code: 'server-error' as const, message: 'Could not read that file.' };
    throw Object.assign(new Error(error.message), { analysisError: error });
  }
  return body;
}

export interface ServiceHealth {
  ok: boolean;
  tokenConfigured: boolean;
  rateLimit: { remaining: number | null; limit: number | null; resetAt: number | null };
  cachedGraphs: number;
}

export async function fetchHealth(): Promise<ServiceHealth | null> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) return null;
    return (await response.json()) as ServiceHealth;
  } catch {
    return null;
  }
}

export function describeRepository(repository: RepositoryInfo): string {
  return `${repository.fullName}@${repository.branch}`;
}
