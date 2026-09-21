/** Server configuration and resource limits. All values are overridable by env. */

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: int('API_PORT', 8787),
  githubToken: process.env.GITHUB_TOKEN?.trim() || null,

  /** Hard ceiling on git tree entries we will even look at. */
  maxTreeEntries: int('MAX_TREE_ENTRIES', 40_000),
  /** Source files downloaded and parsed for imports/symbols. */
  maxParsedFiles: int('MAX_PARSED_FILES', 1_800),
  /** Files bigger than this are represented as nodes but never downloaded. */
  maxFileBytes: int('MAX_FILE_BYTES', 400_000),
  /** Whole-analysis budget. */
  analysisTimeoutMs: int('ANALYSIS_TIMEOUT_MS', 90_000),
  /** Per-request budget for a single GitHub call. */
  requestTimeoutMs: int('REQUEST_TIMEOUT_MS', 20_000),
  /** Parallel source downloads. */
  fetchConcurrency: int('FETCH_CONCURRENCY', 16),
  /** Repositories larger than this (KB, as GitHub reports) are refused. */
  maxRepositorySizeKb: int('MAX_REPOSITORY_SIZE_KB', 900_000),
  /** Symbol nodes are capped so the scene stays navigable. */
  maxSymbolNodes: int('MAX_SYMBOL_NODES', 1_500),
  /** Bytes of source returned by the file-preview endpoint. */
  maxPreviewBytes: int('MAX_PREVIEW_BYTES', 180_000),

  cacheTtlMs: int('CACHE_TTL_MS', 15 * 60 * 1000),
  cacheMaxEntries: int('CACHE_MAX_ENTRIES', 24),
} as const;

export const USER_AGENT = 'RepoVerse/0.1 (+https://github.com/Misbah542/Pyramid)';
