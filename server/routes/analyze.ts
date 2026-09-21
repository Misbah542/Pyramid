/**
 * Analysis API.
 *
 *   GET /api/health             — service + rate-limit status
 *   GET /api/analyze            — analyse a repository, respond with the graph
 *   GET /api/analyze/stream     — same, as a server-sent event progress stream
 *   GET /api/source             — read one file for the inspector's preview
 *
 * Every route validates its input before anything is fetched: `repo` must parse
 * as a github.com owner/name pair, and `ref`/`path` are checked for traversal.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AnalysisEvent, RepositoryGraph } from '@shared/graph';
import { parseFullName, isSafeGitRef } from '@shared/repo-url';
import { detectLanguage } from '@shared/language';
import { analyzeRepository } from '../analysis/analyze';
import { TtlCache } from '../cache';
import { config } from '../config';
import { getFileContent, getRateLimitSnapshot, GitHubError, isTokenConfigured } from '../github';

export const analyzeRouter = Router();

const graphCache = new TtlCache<RepositoryGraph>(config.cacheTtlMs, config.cacheMaxEntries);
const sourceCache = new TtlCache<{ content: string; truncated: boolean }>(config.cacheTtlMs, 400);

const querySchema = z.object({
  repo: z.string().min(3).max(140),
  ref: z.string().max(250).optional(),
  fresh: z.enum(['0', '1']).optional(),
});

const sourceSchema = z.object({
  repo: z.string().min(3).max(140),
  ref: z.string().max(250),
  path: z.string().min(1).max(400),
});

interface ResolvedQuery {
  owner: string;
  name: string;
  fullName: string;
  ref?: string;
}

function resolveQuery(req: Request, res: Response): ResolvedQuery | null {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'invalid-url', message: 'A `repo` query parameter is required.' } });
    return null;
  }
  const repoRef = parseFullName(parsed.data.repo);
  if (!repoRef.ok) {
    res.status(400).json({ error: { code: 'invalid-url', message: repoRef.message } });
    return null;
  }
  const ref = parsed.data.ref;
  if (ref && !isSafeGitRef(ref)) {
    res.status(400).json({ error: { code: 'invalid-url', message: 'That branch or tag name is not supported.' } });
    return null;
  }
  if (parsed.data.fresh === '1') {
    graphCache.delete(cacheKey(repoRef.value.fullName, ref));
  }
  return { owner: repoRef.value.owner, name: repoRef.value.name, fullName: repoRef.value.fullName, ref };
}

const cacheKey = (fullName: string, ref?: string) => `${fullName.toLowerCase()}@${ref ?? 'default'}`;

analyzeRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    tokenConfigured: isTokenConfigured(),
    rateLimit: getRateLimitSnapshot(),
    cachedGraphs: graphCache.size,
    limits: {
      maxParsedFiles: config.maxParsedFiles,
      maxFileBytes: config.maxFileBytes,
      analysisTimeoutMs: config.analysisTimeoutMs,
    },
  });
});

analyzeRouter.get('/analyze', async (req, res) => {
  const query = resolveQuery(req, res);
  if (!query) return;

  const key = cacheKey(query.fullName, query.ref);
  const cached = graphCache.get(key);
  if (cached) {
    res.json({ graph: cached, cached: true });
    return;
  }

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const graph = await analyzeRepository({
      owner: query.owner,
      repo: query.name,
      ref: query.ref,
      signal: controller.signal,
    });
    graphCache.set(key, graph);
    res.json({ graph, cached: false });
  } catch (error) {
    const analysisError = toAnalysisError(error);
    res.status(statusFor(analysisError.code)).json({ error: analysisError });
  }
});

analyzeRouter.get('/analyze/stream', async (req, res) => {
  const query = resolveQuery(req, res);
  if (!query) return;

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  const send = (event: AnalysisEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  const controller = new AbortController();
  let closed = false;
  req.on('close', () => {
    closed = true;
    controller.abort();
    clearInterval(heartbeat);
  });

  const key = cacheKey(query.fullName, query.ref);
  const cached = graphCache.get(key);

  try {
    if (cached) {
      // Replay the stage timeline instantly so the UI shows what happened,
      // then hand over the cached graph.
      send({ type: 'repository', repository: cached.repository });
      for (const stage of ['validate', 'metadata', 'tree', 'select', 'symbols', 'imports', 'graph'] as const) {
        send({ type: 'stage', stage, state: 'done', detail: 'From cache' });
      }
      for (const warning of cached.warnings) send({ type: 'warning', warning });
      send({ type: 'result', graph: cached });
    } else {
      const graph = await analyzeRepository({
        owner: query.owner,
        repo: query.name,
        ref: query.ref,
        signal: controller.signal,
        onEvent: (event) => {
          if (!closed) send(event);
        },
      });
      graphCache.set(key, graph);
      if (!closed) send({ type: 'result', graph });
    }
  } catch (error) {
    if (!closed) send({ type: 'error', error: toAnalysisError(error) });
  } finally {
    clearInterval(heartbeat);
    if (!closed) res.end();
  }
});

analyzeRouter.get('/source', async (req, res) => {
  const parsed = sourceSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'invalid-url', message: 'repo, ref and path are required.' } });
    return;
  }
  const repoRef = parseFullName(parsed.data.repo);
  if (!repoRef.ok) {
    res.status(400).json({ error: { code: 'invalid-url', message: repoRef.message } });
    return;
  }
  const { ref, path } = parsed.data;
  if (!isSafeGitRef(ref) || path.includes('..') || path.startsWith('/') || path.includes('\\')) {
    res.status(400).json({ error: { code: 'invalid-url', message: 'That file path is not allowed.' } });
    return;
  }

  const key = `${repoRef.value.fullName}@${ref}:${path}`;
  const cached = sourceCache.get(key);
  if (cached) {
    res.json({ ...cached, path, language: detectLanguage(path)?.id ?? null, cached: true });
    return;
  }

  try {
    const file = await getFileContent(
      repoRef.value.owner,
      repoRef.value.name,
      ref,
      path,
      config.maxPreviewBytes,
    );
    if (!file) {
      res.status(404).json({ error: { code: 'not-found', message: 'That file could not be read.' } });
      return;
    }
    const payload = { content: file.content, truncated: file.truncated };
    sourceCache.set(key, payload);
    res.json({ ...payload, path, language: detectLanguage(path)?.id ?? null, cached: false });
  } catch (error) {
    const analysisError = toAnalysisError(error);
    res.status(statusFor(analysisError.code)).json({ error: analysisError });
  }
});

function toAnalysisError(error: unknown) {
  if (error instanceof GitHubError) return error.toAnalysisError();
  if (error instanceof Error && error.name === 'AbortError') {
    return { code: 'timeout' as const, message: 'The analysis was cancelled.' };
  }
  return {
    code: 'server-error' as const,
    message: 'The analysis failed unexpectedly.',
    detail: error instanceof Error ? error.message : undefined,
  };
}

function statusFor(code: string): number {
  switch (code) {
    case 'invalid-url':
      return 400;
    case 'not-found':
      return 404;
    case 'private-repository':
      return 403;
    case 'rate-limited':
      return 429;
    case 'too-large':
    case 'no-supported-sources':
    case 'empty-repository':
      return 422;
    case 'timeout':
      return 504;
    default:
      return 502;
  }
}
