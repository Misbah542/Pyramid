import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode, NodeType, RepositoryGraph } from '@shared/graph';
import {
  buildGraphIndex,
  DEFAULT_FILTERS,
  findDependencyCycles,
  findDependencyPath,
  getAncestors,
  getConnectedNodeIds,
  getDescendants,
  selectVisibleEdges,
  selectVisibleNodes,
} from '@shared/graph-utils';

function node(id: string, type: NodeType, parentId: string | null, depth: number): GraphNode {
  return {
    id,
    type,
    name: id.split(':').pop() ?? id,
    path: id.replace(/^[a-z]+:/, ''),
    parentId,
    moduleId: null,
    language: type === 'file' ? 'typescript' : null,
    metadata: { depth, sourceAvailability: 'available' },
  };
}

function edge(id: string, source: string, target: string, type: GraphEdge['type']): GraphEdge {
  return { id, source, target, type, direction: 'directed' };
}

const graph: RepositoryGraph = {
  repository: {
    owner: 'o',
    name: 'r',
    fullName: 'o/r',
    url: '',
    branch: 'main',
    defaultBranch: 'main',
    description: null,
    primaryLanguage: null,
    languages: {},
    stars: null,
    sizeKb: null,
    commit: null,
    isDemo: true,
  },
  nodes: [
    node('repo', 'repository', null, 0),
    node('dir:a', 'module', 'repo', 1),
    node('dir:b', 'module', 'repo', 1),
    node('file:a/one.ts', 'file', 'dir:a', 2),
    node('file:a/two.ts', 'file', 'dir:a', 2),
    node('file:b/three.ts', 'file', 'dir:b', 2),
    node('file:b/three.test.ts', 'test', 'dir:b', 2),
    node('ext:npm:zod', 'external', null, 1),
  ],
  edges: [
    edge('c1', 'repo', 'dir:a', 'contains'),
    edge('c2', 'repo', 'dir:b', 'contains'),
    edge('c3', 'dir:a', 'file:a/one.ts', 'contains'),
    edge('c4', 'dir:a', 'file:a/two.ts', 'contains'),
    edge('c5', 'dir:b', 'file:b/three.ts', 'contains'),
    edge('c6', 'dir:b', 'file:b/three.test.ts', 'contains'),
    edge('i1', 'file:a/one.ts', 'file:a/two.ts', 'import'),
    edge('i2', 'file:a/two.ts', 'file:b/three.ts', 'import'),
    edge('i3', 'file:b/three.ts', 'ext:npm:zod', 'external-dependency'),
    edge('t1', 'file:b/three.test.ts', 'file:b/three.ts', 'test-of'),
    edge('m1', 'dir:a', 'dir:b', 'module-dependency'),
    edge('m2', 'dir:b', 'dir:a', 'module-dependency'),
  ],
  metadata: {
    analyzedAt: new Date(0).toISOString(),
    durationMs: 0,
    nodeCount: 8,
    edgeCount: 12,
    fileCount: 4,
    directoryCount: 2,
    externalDependencyCount: 1,
    testFileCount: 1,
    configFileCount: 0,
    parsedFileCount: 4,
    skippedFileCount: 0,
    totalTreeEntries: 4,
    truncated: false,
    languageStats: [],
    symbolExtraction: false,
  },
  analysisStatus: 'complete',
  warnings: [],
};

const index = buildGraphIndex(graph);

describe('buildGraphIndex', () => {
  it('indexes nodes, children and the repository root', () => {
    expect(index.rootId).toBe('repo');
    expect(index.children.get('repo')).toEqual(['dir:a', 'dir:b']);
    expect(index.nodes.size).toBe(8);
  });

  it('drops edges whose endpoints are missing', () => {
    const broken = buildGraphIndex({ ...graph, edges: [...graph.edges, edge('x', 'nope', 'repo', 'import')] });
    expect(broken.edges.has('x')).toBe(false);
  });
});

describe('hierarchy traversal', () => {
  it('walks ancestors from root to parent', () => {
    expect(getAncestors(index, 'file:a/one.ts').map((n) => n.id)).toEqual(['repo', 'dir:a']);
  });

  it('collects descendants, optionally depth limited', () => {
    expect(getDescendants(index, 'repo').length).toBe(6);
    expect(getDescendants(index, 'repo', { maxDepth: 1 }).map((n) => n.id)).toEqual(['dir:a', 'dir:b']);
  });
});

describe('dependency queries', () => {
  it('finds directly connected nodes, ignoring hierarchy edges', () => {
    const connected = getConnectedNodeIds(index, 'file:a/two.ts');
    expect([...connected].sort()).toEqual(['file:a/one.ts', 'file:b/three.ts']);
  });

  it('traces a shortest dependency path', () => {
    const path = findDependencyPath(index, 'file:a/one.ts', 'ext:npm:zod');
    expect(path?.map((e) => e.id)).toEqual(['i1', 'i2', 'i3']);
  });

  it('returns null when no path exists', () => {
    expect(findDependencyPath(index, 'ext:npm:zod', 'file:a/one.ts')).toBeNull();
  });

  it('detects a module cycle', () => {
    const cycles = findDependencyCycles(index, ['dir:a', 'dir:b']);
    expect(cycles.length).toBe(1);
    expect(cycles[0].sort()).toEqual(['dir:a', 'dir:b']);
  });
});

describe('visibility filters', () => {
  it('shows everything by default', () => {
    const visible = selectVisibleNodes(graph, index, DEFAULT_FILTERS);
    expect(visible.size).toBe(8);
  });

  it('hides tests and externals when switched off', () => {
    const visible = selectVisibleNodes(graph, index, {
      ...DEFAULT_FILTERS,
      showTests: false,
      showExternal: false,
    });
    expect(visible.has('file:b/three.test.ts')).toBe(false);
    expect(visible.has('ext:npm:zod')).toBe(false);
    expect(visible.has('file:b/three.ts')).toBe(true);
  });

  it('keeps ancestors of visible nodes so the hierarchy never breaks', () => {
    const visible = selectVisibleNodes(graph, index, { ...DEFAULT_FILTERS, maxDepth: 2, nodeTypes: new Set(['file']) });
    expect(visible.has('dir:a')).toBe(true);
    expect(visible.has('repo')).toBe(true);
  });

  it('isolating a module keeps its subtree and direct dependencies only', () => {
    const visible = selectVisibleNodes(graph, index, { ...DEFAULT_FILTERS, isolatedId: 'dir:a' });
    expect(visible.has('file:a/one.ts')).toBe(true);
    expect(visible.has('file:b/three.ts')).toBe(true); // depended on by a/two.ts
    expect(visible.has('file:b/three.test.ts')).toBe(false);
  });

  it('only returns edges whose endpoints are both visible', () => {
    const visible = selectVisibleNodes(graph, index, { ...DEFAULT_FILTERS, showExternal: false });
    const edges = selectVisibleEdges(graph, visible);
    expect(edges.some((e) => e.target === 'ext:npm:zod')).toBe(false);
  });
});
