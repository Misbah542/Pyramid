import { describe, expect, it } from 'vitest';
import { createDemoGraph } from '@/demo/demo-graph';
import { computeLayout, type LayoutMode } from '@/graph/layouts';
import { fuzzyScore, searchNodes, splitHighlight } from '@/graph/search';
import { buildGraphIndex } from '@shared/graph-utils';
import { computeInsights } from '@/graph/insights';

const graph = createDemoGraph();

describe('demo graph integrity', () => {
  it('has no dangling edges', () => {
    const ids = new Set(graph.nodes.map((node) => node.id));
    for (const edge of graph.edges) {
      expect(ids.has(edge.source), `${edge.id} source`).toBe(true);
      expect(ids.has(edge.target), `${edge.id} target`).toBe(true);
    }
  });

  it('has no duplicate node ids', () => {
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length);
  });

  it('is labelled as a demo so the UI can say so', () => {
    expect(graph.repository.isDemo).toBe(true);
  });

  it('reports counts that match the nodes it contains', () => {
    const files = graph.nodes.filter((n) => ['file', 'test', 'config'].includes(n.type));
    expect(graph.metadata.fileCount).toBe(files.length);
    expect(graph.metadata.nodeCount).toBe(graph.nodes.length);
    expect(graph.metadata.externalDependencyCount).toBe(graph.nodes.filter((n) => n.type === 'external').length);
  });

  it('derives dependency counts from the edges', () => {
    const client = graph.nodes.find((n) => n.path === 'packages/core-sdk/src/client.ts');
    expect(client?.metadata.incomingDependencyCount).toBeGreaterThan(0);
    expect(client?.metadata.outgoingDependencyCount).toBeGreaterThan(0);
  });

  it('rolls file counts up the directory tree', () => {
    const apps = graph.nodes.find((n) => n.id === 'dir:apps');
    expect(apps?.metadata.descendantFileCount).toBeGreaterThan(10);
  });
});

describe('fuzzy search', () => {
  it('prefers a contiguous match over a scattered one', () => {
    const exact = fuzzyScore('ProfileViewModel.kt', 'ViewModel')!;
    const scattered = fuzzyScore('VeryImportantEventWorkerModelizer.kt', 'ViewModel')!;
    expect(exact.score).toBeGreaterThan(scattered.score);
  });

  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyScore('App.tsx', 'zzz')).toBeNull();
  });

  it('matches camelCase initials', () => {
    expect(fuzzyScore('ProjectRepository', 'ProjRepo')).not.toBeNull();
  });

  it('finds files by name across the demo graph', () => {
    const results = searchNodes(graph.nodes, 'ProjectRepository');
    expect(results[0].node.name).toBe('ProjectRepository.kt');
  });

  it('finds a file by a symbol it declares', () => {
    const results = searchNodes(graph.nodes, 'HelioClient');
    expect(results.some((r) => r.node.path === 'packages/core-sdk/src/client.ts')).toBe(true);
  });

  it('can be restricted to node types', () => {
    const results = searchNodes(graph.nodes, 'src', { types: new Set(['directory']) });
    expect(results.every((r) => r.node.type === 'directory')).toBe(true);
  });

  it('splits a label into matched and unmatched runs', () => {
    const parts = splitHighlight('App.tsx', [0, 1, 2]);
    expect(parts).toEqual([
      { text: 'App', match: true },
      { text: '.tsx', match: false },
    ]);
  });
});

describe('layouts', () => {
  const layoutNodes = graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    parentId: node.parentId,
    moduleId: node.moduleId,
    depth: node.metadata.depth,
    weight: node.metadata.descendantFileCount ?? 1,
    degree: (node.metadata.incomingDependencyCount ?? 0) + (node.metadata.outgoingDependencyCount ?? 0),
  }));
  const layoutEdges = graph.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    type: edge.type,
    weight: edge.metadata?.weight ?? 1,
  }));

  const modes: LayoutMode[] = ['architecture', 'galaxy', 'tree', 'focus', 'flow'];

  for (const mode of modes) {
    it(`${mode} positions every node with finite coordinates`, () => {
      const result = computeLayout({
        mode,
        nodes: layoutNodes,
        edges: layoutEdges,
        rootId: 'repo',
        focusId: 'dir:packages',
        spread: 1,
      });
      expect(result.ids.length).toBe(layoutNodes.length);
      expect(result.positions.length).toBe(layoutNodes.length * 3);
      for (let i = 0; i < result.positions.length; i += 1) {
        expect(Number.isFinite(result.positions[i]), `${mode}[${i}]`).toBe(true);
      }
      expect(result.extent).toBeGreaterThan(0);
    });

    it(`${mode} is deterministic across runs`, () => {
      const request = {
        mode,
        nodes: layoutNodes,
        edges: layoutEdges,
        rootId: 'repo',
        focusId: 'dir:packages',
        spread: 1,
      };
      const first = computeLayout(request);
      const second = computeLayout(request);
      expect(Array.from(second.positions)).toEqual(Array.from(first.positions));
    });
  }

  it('keeps the repository at the origin in the architecture layout', () => {
    const result = computeLayout({
      mode: 'architecture',
      nodes: layoutNodes,
      edges: layoutEdges,
      rootId: 'repo',
      spread: 1,
    });
    const index = result.ids.indexOf('repo');
    expect(result.positions[index * 3]).toBe(0);
    expect(result.positions[index * 3 + 1]).toBe(0);
    expect(result.positions[index * 3 + 2]).toBe(0);
  });

  it('separates siblings by at least a node diameter', () => {
    const result = computeLayout({
      mode: 'architecture',
      nodes: layoutNodes,
      edges: layoutEdges,
      rootId: 'repo',
      spread: 1,
    });
    const positionOf = (id: string) => {
      const index = result.ids.indexOf(id);
      return [result.positions[index * 3], result.positions[index * 3 + 1], result.positions[index * 3 + 2]];
    };
    const siblings = graph.nodes.filter((node) => node.parentId === 'dir:packages/core-sdk/src');
    for (let i = 0; i < siblings.length; i += 1) {
      for (let j = i + 1; j < siblings.length; j += 1) {
        const a = positionOf(siblings[i].id);
        const b = positionOf(siblings[j].id);
        const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        expect(distance).toBeGreaterThan(2);
      }
    }
  });
});

describe('insights', () => {
  const index = buildGraphIndex(graph);
  const sections = computeInsights(graph, index);

  it('produces the three documented sections', () => {
    expect(sections.map((s) => s.id)).toEqual(['structure', 'dependencies', 'coverage']);
  });

  it('never invents a value it could not measure', () => {
    for (const section of sections) {
      for (const insight of section.insights) {
        if (insight.value === null) expect(insight.meaning.length).toBeGreaterThan(10);
      }
    }
  });

  it('reports the largest module from measured file counts', () => {
    const structure = sections.find((s) => s.id === 'structure')!;
    const largest = structure.insights.find((i) => i.id === 'largest-modules')!;
    expect(largest.value).toBe('apps');
  });
});
