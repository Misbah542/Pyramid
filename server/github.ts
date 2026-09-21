/**
 * Thin GitHub REST client.
 *
 * Only public, read-only endpoints are used. The token (when configured) lives
 * here and is never serialised into any response — the browser talks to
 * RepoVerse's own API, never to GitHub with our credentials.
 */

import type { AnalysisError, AnalysisErrorCode } from '@shared/graph';
import { isSafeGitRef } from '@shared/repo-url';
import { config, USER_AGENT } from './config';

const API_ROOT = 'https://api.github.com';
const RAW_ROOT = 'https://raw.githubusercontent.com';

export class GitHubError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
    readonly detail?: string,
    readonly retryAt?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }

  toAnalysisError(): AnalysisError {
    const error: AnalysisError = { code: this.code, message: this.message };
    if (this.detail) error.detail = this.detail;
    if (this.retryAt) error.retryAt = this.retryAt;
    return error;
  }
}

export interface RateLimitSnapshot {
  remaining: number | null;
  limit: number | null;
  resetAt: number | null;
}

let lastRateLimit: RateLimitSnapshot = { remaining: null, limit: null, resetAt: null };

export function getRateLimitSnapshot(): RateLimitSnapshot {
  return lastRateLimit;
}

export function isTokenConfigured(): boolean {
  return config.githubToken !== null;
}

function headers(accept = 'application/vnd.github+json'): HeadersInit {
  const base: Record<string, string> = {
    accept,
    'user-agent': USER_AGENT,
    'x-github-api-version': '2022-11-28',
  };
  if (config.githubToken) base.authorization = `Bearer ${config.githubToken}`;
  return base;
}

function recordRateLimit(response: Response): void {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const limit = response.headers.get('x-ratelimit-limit');
  const reset = response.headers.get('x-ratelimit-reset');
  lastRateLimit = {
    remaining: remaining === null ? lastRateLimit.remaining : Number(remaining),
    limit: limit === null ? lastRateLimit.limit : Number(limit),
    resetAt: reset === null ? lastRateLimit.resetAt : Number(reset),
  };
}

async function errorFor(response: Response, what: string): Promise<GitHubError> {
  let apiMessage = '';
  try {
    const body = (await response.json()) as { message?: string };
    apiMessage = body.message ?? '';
  } catch {
    /* body was not JSON — the status code is enough. */
  }

  const remaining = response.headers.get('x-ratelimit-remaining');
  const resetAt = Number(response.headers.get('x-ratelimit-reset')) || undefined;

  if (response.status === 403 && remaining === '0') {
    return new GitHubError(
      'rate-limited',
      'GitHub API rate limit reached.',
      config.githubToken
        ? 'The configured token has exhausted its hourly quota.'
        : 'Unauthenticated requests are limited to 60/hour. Set GITHUB_TOKEN on the server to raise this to 5,000/hour.',
      resetAt,
    );
  }
  if (response.status === 429) {
    return new GitHubError('rate-limited', 'GitHub asked us to slow down.', apiMessage, resetAt);
  }
  if (response.status === 404) {
    return new GitHubError(
      'not-found',
      'Repository not found.',
      'It may not exist, it may have been renamed, or it may be private. RepoVerse can only analyse public repositories.',
    );
  }
  if (response.status === 403 || response.status === 401) {
    return new GitHubError('private-repository', 'That repository is not publicly readable.', apiMessage);
  }
  if (response.status === 409) {
    return new GitHubError('empty-repository', 'This repository is empty — there is nothing to analyse yet.');
  }
  if (response.status >= 500) {
    return new GitHubError('network', 'GitHub returned a server error. Try again shortly.', `${what}: ${response.status}`);
  }
  return new GitHubError('server-error', `Unexpected response from GitHub (${response.status}).`, apiMessage || what);
}

async function request<T>(path: string, what: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      headers: headers(),
      signal: signal ?? AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.includes('abort') || reason.includes('timeout')) {
      throw new GitHubError('timeout', 'GitHub took too long to respond.', what);
    }
    throw new GitHubError('network', 'Could not reach GitHub.', reason);
  }

  recordRateLimit(response);
  if (!response.ok) throw await errorFor(response, what);
  return (await response.json()) as T;
}

export interface RepositoryResponse {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  size: number;
  private: boolean;
  fork: boolean;
  owner: { login: string };
}

export interface TreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

export interface TreeResponse {
  sha: string;
  tree: TreeEntry[];
  truncated: boolean;
}

export function getRepository(owner: string, repo: string, signal?: AbortSignal): Promise<RepositoryResponse> {
  return request<RepositoryResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    'repository metadata',
    signal,
  );
}

export async function getLanguages(
  owner: string,
  repo: string,
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  try {
    return await request<Record<string, number>>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`,
      'language breakdown',
      signal,
    );
  } catch {
    // Language stats are a nicety; never fail the analysis over them.
    return {};
  }
}

export async function getTree(
  owner: string,
  repo: string,
  ref: string,
  signal?: AbortSignal,
): Promise<TreeResponse> {
  if (!isSafeGitRef(ref)) {
    throw new GitHubError('invalid-url', 'That branch or tag name is not supported.');
  }
  return request<TreeResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    'git tree',
    signal,
  );
}

export interface RawFile {
  path: string;
  content: string;
  truncated: boolean;
}

/**
 * Reads one file. raw.githubusercontent.com is preferred because it does not
 * consume the REST quota; the contents API is the fallback.
 *
 * `path` always comes from a git tree response, so it is repository-relative by
 * construction — it is still re-checked here to keep traversal impossible.
 */
export async function getFileContent(
  owner: string,
  repo: string,
  ref: string,
  path: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<RawFile | null> {
  if (!isSafeGitRef(ref) || path.includes('..') || path.startsWith('/')) return null;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');

  try {
    const response = await fetch(`${RAW_ROOT}/${owner}/${repo}/${ref}/${encodedPath}`, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/plain',
        ...(config.githubToken ? { authorization: `Bearer ${config.githubToken}` } : {}),
      },
      signal: signal ?? AbortSignal.timeout(config.requestTimeoutMs),
    });
    if (response.ok) {
      const text = await response.text();
      return truncate(path, text, maxBytes);
    }
  } catch {
    /* fall through to the contents API */
  }

  try {
    const body = await request<{ content?: string; encoding?: string; size?: number }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      `file ${path}`,
      signal,
    );
    if (!body.content || body.encoding !== 'base64') return null;
    return truncate(path, Buffer.from(body.content, 'base64').toString('utf8'), maxBytes);
  } catch (error) {
    if (error instanceof GitHubError && error.code === 'rate-limited') throw error;
    return null;
  }
}

function truncate(path: string, text: string, maxBytes: number): RawFile {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return { path, content: text, truncated: false };
  }
  const sliced = Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8');
  return { path, content: sliced, truncated: true };
}
