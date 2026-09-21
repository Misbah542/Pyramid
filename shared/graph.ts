/**
 * RepoVerse graph schema.
 *
 * This module is the contract between the analysis backend (`server/`) and the
 * visualisation frontend (`src/`). It contains types only — no runtime deps —
 * so new language parsers or relationship kinds can be added on the server
 * without the renderer needing to know how they were derived.
 */

export const NODE_TYPES = [
  'repository',
  'directory',
  'module',
  'package',
  'file',
  'test',
  'config',
  'class',
  'interface',
  'function',
  'external',
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = [
  /** Hierarchy: parent directory → child. */
  'contains',
  /** Static import/include between two source files in the repository. */
  'import',
  /** Aggregated file-level imports lifted to the module level. */
  'module-dependency',
  /** A file (or symbol) depends on a third-party package. */
  'external-dependency',
  /** Test file → the source file it appears to cover. */
  'test-of',
  /** Class extends class. */
  'extends',
  /** Class implements interface. */
  'implements',
  /** File → symbol it declares. */
  'declares',
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

/** How confident the analyser is about a relationship it reports. */
export type EdgeConfidence = 'resolved' | 'heuristic';

export type SourceAvailability = 'available' | 'unavailable' | 'too-large' | 'not-fetched';

export interface SymbolRef {
  name: string;
  kind: 'class' | 'interface' | 'function';
  line: number;
}

export interface NodeMetadata {
  /** Depth in the directory hierarchy; the repository root is 0. */
  depth: number;
  /** Number of physical lines. Only present for files whose source was read. */
  lineCount?: number;
  byteSize?: number;
  /** Import statements found in this file. */
  importCount?: number;
  /** Edges pointing at this node (import / module-dependency / external). */
  incomingDependencyCount?: number;
  /** Edges leaving this node. */
  outgoingDependencyCount?: number;
  /** Direct children in the hierarchy. */
  childCount?: number;
  /** Files anywhere beneath this node. */
  descendantFileCount?: number;
  /** Total bytes of files beneath this node. */
  descendantByteSize?: number;
  symbols?: SymbolRef[];
  sourceAvailability: SourceAvailability;
  /** Package ecosystem for external nodes, e.g. `npm`, `go`, `maven`. */
  ecosystem?: string;
  /** Set when the file matched a test path/name convention. */
  isTest?: boolean;
  /** Set when the file matched a build/config convention. */
  isConfig?: boolean;
  /** Languages present beneath a directory node, by file count. */
  languageMix?: Record<string, number>;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  /** Repo-relative POSIX path. Empty string for the repository root. */
  path: string;
  parentId: string | null;
  /** Top-level module (first path segment) this node belongs to. */
  moduleId: string | null;
  language: string | null;
  metadata: NodeMetadata;
}

export interface EdgeMetadata {
  /** The raw import specifier that produced this edge, when applicable. */
  specifier?: string;
  /** Number of underlying relationships collapsed into this edge. */
  weight?: number;
  confidence?: EdgeConfidence;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  direction: 'directed' | 'undirected';
  metadata?: EdgeMetadata;
}

export interface RepositoryInfo {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  /** Branch actually analysed. */
  branch: string;
  defaultBranch: string | null;
  description: string | null;
  primaryLanguage: string | null;
  /** Bytes per language, as reported by GitHub. */
  languages: Record<string, number>;
  stars: number | null;
  /** Repository size in KB, as reported by GitHub. */
  sizeKb: number | null;
  /** Commit SHA the analysis was performed against, when known. */
  commit: string | null;
  isDemo: boolean;
}

export interface LanguageStat {
  language: string;
  files: number;
  lines: number;
}

export interface GraphMetadata {
  analyzedAt: string;
  /** Wall-clock duration of the server-side analysis. */
  durationMs: number;
  nodeCount: number;
  edgeCount: number;
  fileCount: number;
  directoryCount: number;
  externalDependencyCount: number;
  testFileCount: number;
  configFileCount: number;
  /** Files whose contents were downloaded and parsed. */
  parsedFileCount: number;
  /** Source files that were recognised but skipped because of resource limits. */
  skippedFileCount: number;
  /** Every blob in the git tree, including ones RepoVerse does not parse. */
  totalTreeEntries: number;
  /** True when GitHub truncated the tree listing, or limits cut the analysis short. */
  truncated: boolean;
  languageStats: LanguageStat[];
  /** True when symbol-level nodes (class/interface/function) were extracted. */
  symbolExtraction: boolean;
}

export type AnalysisStatusKind = 'complete' | 'partial' | 'failed';

export interface AnalysisWarning {
  code:
    | 'tree-truncated'
    | 'file-limit'
    | 'file-too-large'
    | 'parse-failed'
    | 'unresolved-imports'
    | 'no-supported-sources'
    | 'rate-limit-near'
    | 'timeout'
    | 'source-unavailable';
  message: string;
  detail?: string;
}

export interface RepositoryGraph {
  repository: RepositoryInfo;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: GraphMetadata;
  analysisStatus: AnalysisStatusKind;
  warnings: AnalysisWarning[];
}

/* ------------------------------------------------------------------ *
 * Analysis progress protocol (server-sent events)
 * ------------------------------------------------------------------ */

export const ANALYSIS_STAGES = [
  'validate',
  'metadata',
  'tree',
  'select',
  'symbols',
  'imports',
  'graph',
  'layout',
  'ready',
] as const;

export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

export const STAGE_LABELS: Record<AnalysisStage, string> = {
  validate: 'Validating repository URL',
  metadata: 'Fetching repository metadata',
  tree: 'Reading directory structure',
  select: 'Identifying supported source files',
  symbols: 'Extracting modules and symbols',
  imports: 'Detecting imports and dependencies',
  graph: 'Building relationship graph',
  layout: 'Creating 3D spatial layout',
  ready: 'Preparing visualization',
};

/** Stages the browser performs after the API has returned a graph. */
export const CLIENT_STAGES: AnalysisStage[] = ['layout', 'ready'];

export type AnalysisErrorCode =
  | 'invalid-url'
  | 'not-found'
  | 'private-repository'
  | 'rate-limited'
  | 'too-large'
  | 'no-supported-sources'
  | 'empty-repository'
  | 'network'
  | 'timeout'
  | 'server-error';

export interface AnalysisError {
  code: AnalysisErrorCode;
  message: string;
  detail?: string;
  /** Unix seconds at which a GitHub rate limit resets. */
  retryAt?: number;
}

export type AnalysisEvent =
  | {
      type: 'stage';
      stage: AnalysisStage;
      /** `active` while running, `done` once the stage has really finished. */
      state: 'active' | 'done';
      /** Optional human-readable detail, e.g. "412 source files". */
      detail?: string;
    }
  | { type: 'repository'; repository: RepositoryInfo }
  | { type: 'warning'; warning: AnalysisWarning }
  | { type: 'result'; graph: RepositoryGraph }
  | { type: 'error'; error: AnalysisError };
