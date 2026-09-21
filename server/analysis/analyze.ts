/**
 * Repository → RepositoryGraph.
 *
 * The pipeline mirrors the stages the UI shows, and every stage reports when it
 * actually finishes — progress here is measured, never simulated.
 */

import type {
  AnalysisEvent,
  AnalysisStage,
  AnalysisWarning,
  GraphEdge,
  GraphNode,
  LanguageStat,
  NodeType,
  RepositoryGraph,
  RepositoryInfo,
  SymbolRef,
} from '@shared/graph';
import {
  detectLanguage,
  isConfigFile,
  isIgnoredPath,
  isSourceLike,
  isTestFile,
  MANIFEST_FILES,
} from '@shared/language';
import { config } from '../config';
import { getFileContent, getLanguages, getRepository, getTree, GitHubError, type TreeEntry } from '../github';
import { annotateDerivedCounts } from '@shared/graph-build';
import { canParse, parseSource, type ParsedFile } from './parsers';
import { buildFileIndex, resolveImport, type RepoFileIndex } from './resolve';

export interface AnalyzeOptions {
  owner: string;
  repo: string;
  ref?: string;
  onEvent?: (event: AnalysisEvent) => void;
  signal?: AbortSignal;
}

interface FileRecord {
  path: string;
  size: number;
  languageId: string | null;
  isTest: boolean;
  isConfig: boolean;
  parsed?: ParsedFile;
  truncatedSource?: boolean;
  fetched: boolean;
}

const MAX_FILE_NODES = 5_000;

export async function analyzeRepository(options: AnalyzeOptions): Promise<RepositoryGraph> {
  const started = Date.now();
  const deadline = started + config.analysisTimeoutMs;
  const warnings: AnalysisWarning[] = [];
  const emit = (event: AnalysisEvent) => options.onEvent?.(event);

  const stage = (name: AnalysisStage, state: 'active' | 'done', detail?: string) =>
    emit(detail ? { type: 'stage', stage: name, state, detail } : { type: 'stage', stage: name, state });

  const addWarning = (warning: AnalysisWarning) => {
    warnings.push(warning);
    emit({ type: 'warning', warning });
  };

  /* -------------------------------------------------- 1. Validate */
  stage('validate', 'active');
  const { owner, repo } = options;
  stage('validate', 'done', `${owner}/${repo}`);

  /* -------------------------------------------------- 2. Metadata */
  stage('metadata', 'active');
  const [meta, languages] = await Promise.all([
    getRepository(owner, repo, options.signal),
    getLanguages(owner, repo, options.signal),
  ]);

  if (meta.size > config.maxRepositorySizeKb) {
    throw new GitHubError(
      'too-large',
      'This repository is too large for RepoVerse to analyse.',
      `GitHub reports ${(meta.size / 1024).toFixed(0)} MB; the limit is ${(config.maxRepositorySizeKb / 1024).toFixed(0)} MB.`,
    );
  }

  const branch = options.ref ?? meta.default_branch;
  const repository: RepositoryInfo = {
    owner: meta.owner.login,
    name: meta.name,
    fullName: meta.full_name,
    url: meta.html_url,
    branch,
    defaultBranch: meta.default_branch,
    description: meta.description,
    primaryLanguage: meta.language,
    languages,
    stars: meta.stargazers_count,
    sizeKb: meta.size,
    commit: null,
    isDemo: false,
  };
  emit({ type: 'repository', repository });
  stage('metadata', 'done', meta.language ? `Primary language: ${meta.language}` : undefined);

  /* -------------------------------------------------- 3. Tree */
  stage('tree', 'active');
  const tree = await getTree(owner, repo, branch, options.signal);
  repository.commit = tree.sha;

  if (tree.truncated) {
    addWarning({
      code: 'tree-truncated',
      message: 'GitHub truncated the file listing for this repository.',
      detail: 'Some directories are missing from the graph. Analyse a subdirectory-heavy branch or a smaller repo for full coverage.',
    });
  }

  const blobs = tree.tree.filter((entry): entry is TreeEntry => entry.type === 'blob');
  if (blobs.length === 0) {
    throw new GitHubError('empty-repository', 'This repository has no files on that branch.');
  }
  stage('tree', 'done', `${blobs.length.toLocaleString('en-US')} files in tree`);

  /* -------------------------------------------------- 4. Select */
  stage('select', 'active');
  const considered = blobs
    .slice(0, config.maxTreeEntries)
    .filter((entry) => !isIgnoredPath(entry.path))
    .filter((entry) => isSourceLike(entry.path) || isConfigFile(entry.path));

  const ranked = [...considered].sort((a, b) => {
    const aParsable = canParse(detectLanguage(a.path)?.id) ? 0 : 1;
    const bParsable = canParse(detectLanguage(b.path)?.id) ? 0 : 1;
    if (aParsable !== bParsable) return aParsable - bParsable;
    const aDepth = a.path.split('/').length;
    const bDepth = b.path.split('/').length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    return a.path.localeCompare(b.path);
  });

  const selected = ranked.slice(0, MAX_FILE_NODES);
  if (ranked.length > MAX_FILE_NODES) {
    addWarning({
      code: 'file-limit',
      message: `Showing the first ${MAX_FILE_NODES.toLocaleString('en-US')} source files.`,
      detail: `${(ranked.length - MAX_FILE_NODES).toLocaleString('en-US')} further files were left out to keep the scene interactive.`,
    });
  }

  if (selected.length === 0) {
    throw new GitHubError(
      'no-supported-sources',
      'No source files RepoVerse can analyse were found.',
      'The repository may contain only assets, documentation or binaries.',
    );
  }

  const files = new Map<string, FileRecord>();
  for (const entry of selected) {
    const language = detectLanguage(entry.path);
    files.set(entry.path, {
      path: entry.path,
      size: entry.size ?? 0,
      languageId: language?.id ?? null,
      isTest: isTestFile(entry.path),
      isConfig: isConfigFile(entry.path),
      fetched: false,
    });
  }

  const directories = collectDirectories([...files.keys()]);
  stage('select', 'done', `${selected.length.toLocaleString('en-US')} source files selected`);

  /* -------------------------------------------------- 5. Manifests + parsing */
  stage('symbols', 'active');

  const manifestPaths = selected
    .map((entry) => entry.path)
    .filter((path) => {
      const base = path.slice(path.lastIndexOf('/') + 1);
      return (
        (MANIFEST_FILES as readonly string[]).includes(base) ||
        /^(tsconfig|jsconfig)[\w.-]*\.json$/.test(base)
      );
    })
    .slice(0, 40);

  const manifests = new Map<string, string>();
  await runWithConcurrency(manifestPaths, config.fetchConcurrency, async (path) => {
    const file = await getFileContent(owner, repo, tree.sha, path, config.maxFileBytes, options.signal);
    if (file) manifests.set(path, file.content);
  });
  // Root manifests are also keyed by basename so the resolver can find them.
  for (const [path, content] of [...manifests]) {
    const base = path.slice(path.lastIndexOf('/') + 1);
    if (!path.includes('/') && !manifests.has(base)) manifests.set(base, content);
  }

  const fileIndex: RepoFileIndex = buildFileIndex({
    files: [...files.keys()],
    directories: [...directories],
    manifests,
  });

  const parseTargets = [...files.values()]
    .filter((file) => canParse(file.languageId))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));

  const toParse = parseTargets.slice(0, config.maxParsedFiles);
  const skipped = parseTargets.length - toParse.length;
  if (skipped > 0) {
    addWarning({
      code: 'file-limit',
      message: `${skipped.toLocaleString('en-US')} files were not opened.`,
      detail: `RepoVerse reads at most ${config.maxParsedFiles.toLocaleString('en-US')} files per analysis. Those files appear in the structure but contribute no dependency edges.`,
    });
  }

  let oversize = 0;
  let timedOut = false;
  let parsedCount = 0;

  await runWithConcurrency(toParse, config.fetchConcurrency, async (file) => {
    if (Date.now() > deadline) {
      timedOut = true;
      return;
    }
    if (file.size > config.maxFileBytes) {
      oversize += 1;
      return;
    }
    const raw = await getFileContent(owner, repo, tree.sha, file.path, config.maxFileBytes, options.signal);
    if (!raw) return;
    file.parsed = parseSource(file.languageId!, raw.content);
    file.truncatedSource = raw.truncated;
    file.fetched = true;
    parsedCount += 1;
    if (parsedCount % 100 === 0) {
      stage('symbols', 'active', `${parsedCount.toLocaleString('en-US')} files read`);
    }
  });

  if (oversize > 0) {
    addWarning({
      code: 'file-too-large',
      message: `${oversize} file${oversize === 1 ? '' : 's'} exceeded the ${Math.round(config.maxFileBytes / 1024)} KB read limit.`,
      detail: 'They are shown in the structure but were not parsed.',
    });
  }
  if (timedOut) {
    addWarning({
      code: 'timeout',
      message: 'Analysis hit its time budget before every file was read.',
      detail: 'The graph below is partial. Re-running usually gets further because fetched files are cached.',
    });
  }

  const symbolCount = [...files.values()].reduce((total, file) => total + (file.parsed?.symbols.length ?? 0), 0);
  stage('symbols', 'done', `${parsedCount.toLocaleString('en-US')} files parsed · ${symbolCount.toLocaleString('en-US')} symbols`);

  /* -------------------------------------------------- 6. Imports */
  stage('imports', 'active');
  const resolutions = resolveAllImports(files, fileIndex);
  stage(
    'imports',
    'done',
    `${resolutions.internal.length.toLocaleString('en-US')} internal · ${resolutions.externals.size.toLocaleString('en-US')} external packages`,
  );

  /* -------------------------------------------------- 7. Graph */
  stage('graph', 'active');
  const graph = buildGraph({
    repository,
    files,
    directories,
    resolutions,
    warnings,
    startedAt: started,
    treeEntryCount: blobs.length,
    truncated: tree.truncated || timedOut || ranked.length > MAX_FILE_NODES,
    parsedCount,
    skippedCount: skipped + oversize,
  });

  if (resolutions.unresolved > 0) {
    const warning: AnalysisWarning = {
      code: 'unresolved-imports',
      message: `${resolutions.unresolved.toLocaleString('en-US')} import statements could not be matched to a file or package.`,
      detail: 'Usually generated code, build-time aliases or languages RepoVerse resolves only partially.',
    };
    warnings.push(warning);
    emit({ type: 'warning', warning });
  }

  stage('graph', 'done', `${graph.nodes.length.toLocaleString('en-US')} nodes · ${graph.edges.length.toLocaleString('en-US')} edges`);
  return graph;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function collectDirectories(paths: string[]): Set<string> {
  const directories = new Set<string>();
  for (const path of paths) {
    const segments = path.split('/');
    for (let i = 1; i < segments.length; i += 1) {
      directories.add(segments.slice(0, i).join('/'));
    }
  }
  return directories;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await worker(items[index]);
      } catch (error) {
        if (error instanceof GitHubError && error.code === 'rate-limited') throw error;
        /* one unreadable file must not sink the analysis */
      }
    }
  });
  await Promise.all(runners);
}

interface InternalImport {
  from: string;
  to: string;
  specifier: string;
  confidence: 'resolved' | 'heuristic';
  toDirectory: boolean;
}

interface ExternalPackage {
  name: string;
  ecosystem: string;
  importers: Set<string>;
}

interface Resolutions {
  internal: InternalImport[];
  externals: Map<string, ExternalPackage>;
  unresolved: number;
}

function resolveAllImports(files: Map<string, FileRecord>, index: RepoFileIndex): Resolutions {
  const internal: InternalImport[] = [];
  const externals = new Map<string, ExternalPackage>();
  const seen = new Set<string>();
  let unresolved = 0;

  for (const file of files.values()) {
    if (!file.parsed) continue;
    for (const ref of file.parsed.imports) {
      const resolution = resolveImport(index, file.path, ref.specifier);
      if (!resolution) {
        unresolved += 1;
        continue;
      }
      if (resolution.kind === 'external') {
        const key = `${resolution.ecosystem}:${resolution.name}`;
        const existing = externals.get(key);
        if (existing) existing.importers.add(file.path);
        else externals.set(key, { name: resolution.name, ecosystem: resolution.ecosystem, importers: new Set([file.path]) });
        continue;
      }
      if (resolution.path === file.path) continue;
      const key = `${file.path}→${resolution.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      internal.push({
        from: file.path,
        to: resolution.path,
        specifier: ref.specifier,
        confidence: resolution.confidence,
        toDirectory: resolution.kind === 'directory',
      });
    }
  }

  return { internal, externals, unresolved };
}

interface BuildGraphInput {
  repository: RepositoryInfo;
  files: Map<string, FileRecord>;
  directories: Set<string>;
  resolutions: Resolutions;
  warnings: AnalysisWarning[];
  startedAt: number;
  treeEntryCount: number;
  truncated: boolean;
  parsedCount: number;
  skippedCount: number;
}

export const nodeIds = {
  repository: () => 'repo',
  directory: (path: string) => `dir:${path}`,
  file: (path: string) => `file:${path}`,
  external: (ecosystem: string, name: string) => `ext:${ecosystem}:${name}`,
  symbol: (path: string, name: string, line: number) => `sym:${path}#${name}:${line}`,
};

function buildGraph(input: BuildGraphInput): RepositoryGraph {
  const { repository, files, directories, resolutions } = input;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeById = new Map<string, GraphNode>();

  const push = (node: GraphNode) => {
    nodes.push(node);
    nodeById.set(node.id, node);
  };

  const addEdge = (edge: GraphEdge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) return;
    edges.push(edge);
  };

  /* Repository root */
  const rootId = nodeIds.repository();
  push({
    id: rootId,
    type: 'repository',
    name: repository.name,
    path: '',
    parentId: null,
    moduleId: null,
    language: repository.primaryLanguage?.toLowerCase() ?? null,
    metadata: { depth: 0, sourceAvailability: 'not-fetched' },
  });

  /* Directories */
  const directoryList = [...directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  const packageMarkers = new Set(['package.json', 'go.mod', 'Cargo.toml', '__init__.py', 'index.ts', 'index.js', 'mod.rs', 'build.gradle', 'build.gradle.kts', 'pubspec.yaml']);
  const directoriesWithMarker = new Set<string>();
  for (const path of files.keys()) {
    const slash = path.lastIndexOf('/');
    if (slash === -1) continue;
    if (packageMarkers.has(path.slice(slash + 1))) directoriesWithMarker.add(path.slice(0, slash));
  }

  for (const path of directoryList) {
    const segments = path.split('/');
    const depth = segments.length;
    const parentPath = segments.slice(0, -1).join('/');
    const type: NodeType = depth === 1 ? 'module' : directoriesWithMarker.has(path) ? 'package' : 'directory';
    push({
      id: nodeIds.directory(path),
      type,
      name: segments[segments.length - 1],
      path,
      parentId: parentPath ? nodeIds.directory(parentPath) : rootId,
      moduleId: nodeIds.directory(segments[0]),
      language: null,
      metadata: { depth, sourceAvailability: 'not-fetched', childCount: 0, descendantFileCount: 0, descendantByteSize: 0, languageMix: {} },
    });
  }

  /* Files */
  for (const file of files.values()) {
    const segments = file.path.split('/');
    const parentPath = segments.slice(0, -1).join('/');
    const symbols: SymbolRef[] | undefined = file.parsed?.symbols.length
      ? file.parsed.symbols.map((symbol) => ({ name: symbol.name, kind: symbol.kind, line: symbol.line }))
      : undefined;

    push({
      id: nodeIds.file(file.path),
      type: file.isTest ? 'test' : file.isConfig ? 'config' : 'file',
      name: segments[segments.length - 1],
      path: file.path,
      parentId: parentPath ? nodeIds.directory(parentPath) : rootId,
      moduleId: segments.length > 1 ? nodeIds.directory(segments[0]) : rootId,
      language: file.languageId,
      metadata: {
        depth: segments.length,
        byteSize: file.size,
        lineCount: file.parsed?.lineCount,
        importCount: file.parsed?.imports.length,
        symbols,
        isTest: file.isTest,
        isConfig: file.isConfig,
        sourceAvailability: file.fetched ? 'available' : file.size > config.maxFileBytes ? 'too-large' : 'not-fetched',
      },
    });
  }

  /* Symbol nodes — only for files we actually parsed, and only up to a cap so
   * the scene never drowns in detail. */
  let symbolBudget = config.maxSymbolNodes;
  const symbolIdByName = new Map<string, string>();
  const symbolOwners: Array<{ id: string; declared: string[]; file: string }> = [];

  const symbolCandidates = [...files.values()]
    .filter((file) => file.parsed && file.parsed.symbols.length > 0 && !file.isConfig)
    .sort((a, b) => (b.parsed!.symbols.length > 0 ? 1 : 0) - (a.parsed!.symbols.length > 0 ? 1 : 0) || a.path.localeCompare(b.path));

  for (const file of symbolCandidates) {
    if (symbolBudget <= 0) break;
    const fileNodeId = nodeIds.file(file.path);
    const moduleId = file.path.includes('/') ? nodeIds.directory(file.path.split('/')[0]) : rootId;
    for (const symbol of file.parsed!.symbols) {
      if (symbolBudget <= 0) break;
      // Only types and top-level functions become nodes; anonymous helpers stay metadata.
      if (symbol.kind === 'function' && file.parsed!.symbols.length > 25) continue;
      const id = nodeIds.symbol(file.path, symbol.name, symbol.line);
      push({
        id,
        type: symbol.kind,
        name: symbol.name,
        path: `${file.path}:${symbol.line}`,
        parentId: fileNodeId,
        moduleId,
        language: file.languageId,
        metadata: { depth: file.path.split('/').length + 1, sourceAvailability: 'available' },
      });
      addEdge({
        id: `declares:${fileNodeId}:${id}`,
        source: fileNodeId,
        target: id,
        type: 'declares',
        direction: 'directed',
      });
      if (!symbolIdByName.has(symbol.name)) symbolIdByName.set(symbol.name, id);
      const declared = [...(symbol.extends ?? []), ...(symbol.implements ?? [])];
      if (declared.length) symbolOwners.push({ id, declared, file: file.path });
      symbolBudget -= 1;
    }
  }

  /* Hierarchy edges */
  for (const node of nodes) {
    if (!node.parentId) continue;
    if (node.type === 'class' || node.type === 'interface' || node.type === 'function') continue;
    addEdge({
      id: `contains:${node.parentId}:${node.id}`,
      source: node.parentId,
      target: node.id,
      type: 'contains',
      direction: 'directed',
    });
  }

  /* Inheritance between symbol nodes */
  for (const owner of symbolOwners) {
    for (const baseName of owner.declared) {
      const simpleName = baseName.split('.').pop()!;
      const targetId = symbolIdByName.get(simpleName);
      if (!targetId || targetId === owner.id) continue;
      const targetNode = nodeById.get(targetId);
      if (!targetNode) continue;
      addEdge({
        id: `inherit:${owner.id}:${targetId}`,
        source: owner.id,
        target: targetId,
        type: targetNode.type === 'interface' ? 'implements' : 'extends',
        direction: 'directed',
        metadata: { specifier: baseName, confidence: 'heuristic' },
      });
    }
  }

  /* Import edges */
  for (const link of resolutions.internal) {
    const sourceId = nodeIds.file(link.from);
    const targetId = link.toDirectory ? nodeIds.directory(link.to) : nodeIds.file(link.to);
    addEdge({
      id: `import:${sourceId}:${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'import',
      direction: 'directed',
      metadata: { specifier: link.specifier, confidence: link.confidence },
    });
  }

  /* External packages */
  for (const pkg of resolutions.externals.values()) {
    const id = nodeIds.external(pkg.ecosystem, pkg.name);
    push({
      id,
      type: 'external',
      name: pkg.name,
      path: pkg.name,
      parentId: null,
      moduleId: null,
      language: null,
      metadata: {
        depth: 1,
        ecosystem: pkg.ecosystem,
        sourceAvailability: 'unavailable',
        incomingDependencyCount: pkg.importers.size,
      },
    });
    for (const importer of pkg.importers) {
      addEdge({
        id: `ext:${importer}:${id}`,
        source: nodeIds.file(importer),
        target: id,
        type: 'external-dependency',
        direction: 'directed',
        metadata: { confidence: 'resolved' },
      });
    }
  }

  /* Test → source edges, by filename convention */
  for (const file of files.values()) {
    if (!file.isTest) continue;
    const base = file.path.slice(file.path.lastIndexOf('/') + 1);
    const stem = base
      .replace(/\.[^.]+$/, '')
      .replace(/[._-]?(test|spec)s?$/i, '')
      .replace(/^test_/i, '')
      .replace(/(Test|Tests|Spec)$/, '');
    if (stem.length < 2) continue;
    const extension = base.slice(base.lastIndexOf('.'));
    const candidates = [...files.keys()].filter((path) => {
      if (path === file.path) return false;
      const candidateBase = path.slice(path.lastIndexOf('/') + 1);
      return candidateBase === `${stem}${extension}`;
    });
    if (candidates.length !== 1) continue;
    addEdge({
      id: `test:${file.path}:${candidates[0]}`,
      source: nodeIds.file(file.path),
      target: nodeIds.file(candidates[0]),
      type: 'test-of',
      direction: 'directed',
      metadata: { confidence: 'heuristic' },
    });
  }

  /* Module-level aggregation of file imports */
  const moduleEdgeWeights = new Map<string, number>();
  for (const link of resolutions.internal) {
    const fromModule = link.from.split('/')[0];
    const toModule = link.to.split('/')[0];
    if (fromModule === toModule) continue;
    if (!directories.has(fromModule) || !directories.has(toModule)) continue;
    const key = `${fromModule}→${toModule}`;
    moduleEdgeWeights.set(key, (moduleEdgeWeights.get(key) ?? 0) + 1);
  }
  for (const [key, weight] of moduleEdgeWeights) {
    const [fromModule, toModule] = key.split('→');
    addEdge({
      id: `moddep:${fromModule}:${toModule}`,
      source: nodeIds.directory(fromModule),
      target: nodeIds.directory(toModule),
      type: 'module-dependency',
      direction: 'directed',
      metadata: { weight, confidence: 'resolved' },
    });
  }

  /* Derived counts */
  annotateDerivedCounts(nodes, edges);

  const languageStats = computeLanguageStats(files);
  const durationMs = Date.now() - input.startedAt;
  const fileCount = files.size;

  const analysisStatus = input.truncated || input.warnings.some((w) => w.code === 'timeout') ? 'partial' : 'complete';

  return {
    repository,
    nodes,
    edges,
    metadata: {
      analyzedAt: new Date().toISOString(),
      durationMs,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      fileCount,
      directoryCount: directories.size,
      externalDependencyCount: resolutions.externals.size,
      testFileCount: [...files.values()].filter((file) => file.isTest).length,
      configFileCount: [...files.values()].filter((file) => file.isConfig).length,
      parsedFileCount: input.parsedCount,
      skippedFileCount: input.skippedCount,
      totalTreeEntries: input.treeEntryCount,
      truncated: input.truncated,
      languageStats,
      symbolExtraction: nodes.some((node) => node.type === 'class' || node.type === 'interface' || node.type === 'function'),
    },
    analysisStatus,
    warnings: input.warnings,
  };
}

function computeLanguageStats(files: Map<string, FileRecord>): LanguageStat[] {
  const stats = new Map<string, LanguageStat>();
  for (const file of files.values()) {
    if (!file.languageId) continue;
    const entry = stats.get(file.languageId) ?? { language: file.languageId, files: 0, lines: 0 };
    entry.files += 1;
    entry.lines += file.parsed?.lineCount ?? 0;
    stats.set(file.languageId, entry);
  }
  return [...stats.values()].sort((a, b) => b.files - a.files);
}
