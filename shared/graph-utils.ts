/**
 * Pure graph transformations shared by the renderer, the explorer tree, the
 * inspector and the insights panel. Everything here is deterministic and free
 * of DOM/WebGL dependencies so it can be unit tested (see graph-utils.test.ts).
 */

import type { EdgeType, GraphEdge, GraphNode, NodeType, RepositoryGraph } from './graph';

export const HIERARCHY_EDGE_TYPES: ReadonlySet<EdgeType> = new Set<EdgeType>(['contains', 'declares']);

export const DEPENDENCY_EDGE_TYPES: ReadonlySet<EdgeType> = new Set<EdgeType>([
  'import',
  'module-dependency',
  'external-dependency',
  'extends',
  'implements',
  'test-of',
]);

export const CONTAINER_NODE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>([
  'repository',
  'directory',
  'module',
  'package',
]);

export const SYMBOL_NODE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>(['class', 'interface', 'function']);

export const FILE_NODE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>(['file', 'test', 'config']);

export interface GraphIndex {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  /** Hierarchy children, in stable order (directories first, then name). */
  children: Map<string, string[]>;
  outgoing: Map<string, GraphEdge[]>;
  incoming: Map<string, GraphEdge[]>;
  byPath: Map<string, GraphNode>;
  rootId: string | null;
}

const EMPTY: never[] = [];

function compareNodes(a: GraphNode, b: GraphNode): number {
  const aContainer = CONTAINER_NODE_TYPES.has(a.type) ? 0 : 1;
  const bContainer = CONTAINER_NODE_TYPES.has(b.type) ? 0 : 1;
  if (aContainer !== bContainer) return aContainer - bContainer;
  return a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' });
}

export function buildGraphIndex(graph: RepositoryGraph): GraphIndex {
  const nodes = new Map<string, GraphNode>();
  const byPath = new Map<string, GraphNode>();
  const childBuckets = new Map<string, GraphNode[]>();
  const edges = new Map<string, GraphEdge>();
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  let rootId: string | null = null;

  for (const node of graph.nodes) {
    nodes.set(node.id, node);
    if (node.path) byPath.set(node.path, node);
    if (node.type === 'repository') rootId = node.id;
  }

  for (const node of graph.nodes) {
    if (!node.parentId) continue;
    if (!nodes.has(node.parentId)) continue;
    const bucket = childBuckets.get(node.parentId);
    if (bucket) bucket.push(node);
    else childBuckets.set(node.parentId, [node]);
  }

  const children = new Map<string, string[]>();
  for (const [parentId, bucket] of childBuckets) {
    bucket.sort(compareNodes);
    children.set(
      parentId,
      bucket.map((n) => n.id),
    );
  }

  for (const edge of graph.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    edges.set(edge.id, edge);
    const out = outgoing.get(edge.source);
    if (out) out.push(edge);
    else outgoing.set(edge.source, [edge]);
    const inc = incoming.get(edge.target);
    if (inc) inc.push(edge);
    else incoming.set(edge.target, [edge]);
  }

  return { nodes, edges, children, outgoing, incoming, byPath, rootId };
}

export function getChildren(index: GraphIndex, id: string): GraphNode[] {
  const ids = index.children.get(id) ?? EMPTY;
  return ids.map((childId) => index.nodes.get(childId)!).filter(Boolean);
}

export function getAncestors(index: GraphIndex, id: string): GraphNode[] {
  const chain: GraphNode[] = [];
  let current = index.nodes.get(id)?.parentId ?? null;
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    const node = index.nodes.get(current);
    if (!node) break;
    chain.push(node);
    current = node.parentId;
  }
  return chain.reverse();
}

export interface DescendantOptions {
  /** Stop descending once this depth below `id` is reached. */
  maxDepth?: number;
  includeSelf?: boolean;
}

export function getDescendants(index: GraphIndex, id: string, options: DescendantOptions = {}): GraphNode[] {
  const { maxDepth = Infinity, includeSelf = false } = options;
  const out: GraphNode[] = [];
  const seen = new Set<string>([id]);
  const queue: Array<{ id: string; depth: number }> = [{ id, depth: 0 }];

  if (includeSelf) {
    const self = index.nodes.get(id);
    if (self) out.push(self);
  }

  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;
    for (const childId of index.children.get(current.id) ?? EMPTY) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      const child = index.nodes.get(childId);
      if (!child) continue;
      out.push(child);
      queue.push({ id: childId, depth: current.depth + 1 });
    }
  }
  return out;
}

export interface RelatedEdges {
  outgoing: GraphEdge[];
  incoming: GraphEdge[];
}

/** Dependency edges (not hierarchy) touching a node. */
export function getDependencyEdges(index: GraphIndex, id: string): RelatedEdges {
  return {
    outgoing: (index.outgoing.get(id) ?? EMPTY).filter((e) => DEPENDENCY_EDGE_TYPES.has(e.type)),
    incoming: (index.incoming.get(id) ?? EMPTY).filter((e) => DEPENDENCY_EDGE_TYPES.has(e.type)),
  };
}

/** Node ids directly connected to `id` through dependency edges. */
export function getConnectedNodeIds(index: GraphIndex, id: string): Set<string> {
  const result = new Set<string>();
  const { outgoing, incoming } = getDependencyEdges(index, id);
  for (const edge of outgoing) result.add(edge.target);
  for (const edge of incoming) result.add(edge.source);
  return result;
}

/**
 * Shortest directed dependency path between two nodes, or null when none
 * exists. Used by the "trace path" action in the inspector.
 */
export function findDependencyPath(index: GraphIndex, fromId: string, toId: string, maxHops = 12): GraphEdge[] | null {
  if (fromId === toId) return [];
  const previous = new Map<string, GraphEdge>();
  const visited = new Set<string>([fromId]);
  let frontier = [fromId];

  for (let hop = 0; hop < maxHops && frontier.length; hop += 1) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      for (const edge of index.outgoing.get(nodeId) ?? EMPTY) {
        if (!DEPENDENCY_EDGE_TYPES.has(edge.type)) continue;
        if (visited.has(edge.target)) continue;
        visited.add(edge.target);
        previous.set(edge.target, edge);
        if (edge.target === toId) {
          const path: GraphEdge[] = [];
          let cursor: string | undefined = toId;
          while (cursor && cursor !== fromId) {
            const via: GraphEdge | undefined = previous.get(cursor);
            if (!via) break;
            path.unshift(via);
            cursor = via.source;
          }
          return path;
        }
        next.push(edge.target);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Cycles among module-level dependency edges, reported as node-id rings.
 * Deliberately capped: this is a descriptive signal, not an exhaustive audit.
 */
export function findDependencyCycles(index: GraphIndex, nodeIds: string[], limit = 12): string[][] {
  const inScope = new Set(nodeIds);
  const cycles: string[][] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const seenSignatures = new Set<string>();

  const visit = (id: string) => {
    if (cycles.length >= limit) return;
    state.set(id, 1);
    stack.push(id);
    for (const edge of index.outgoing.get(id) ?? EMPTY) {
      if (!DEPENDENCY_EDGE_TYPES.has(edge.type)) continue;
      const next = edge.target;
      if (!inScope.has(next) || next === id) continue;
      const nextState = state.get(next) ?? 0;
      if (nextState === 0) {
        visit(next);
      } else if (nextState === 1) {
        const start = stack.indexOf(next);
        if (start >= 0) {
          const ring = stack.slice(start);
          const signature = [...ring].sort().join('|');
          if (!seenSignatures.has(signature)) {
            seenSignatures.add(signature);
            cycles.push(ring);
          }
        }
      }
      if (cycles.length >= limit) break;
    }
    stack.pop();
    state.set(id, 2);
  };

  for (const id of nodeIds) {
    if ((state.get(id) ?? 0) === 0) visit(id);
    if (cycles.length >= limit) break;
  }
  return cycles;
}

export interface GraphFilters {
  nodeTypes: ReadonlySet<NodeType>;
  languages: ReadonlySet<string> | null;
  showTests: boolean;
  showExternal: boolean;
  showConfig: boolean;
  /** Restrict to a subtree plus anything it depends on / is depended on by. */
  isolatedId: string | null;
  /** Deepest hierarchy level to include. */
  maxDepth: number;
}

export const DEFAULT_FILTERS: GraphFilters = {
  nodeTypes: new Set<NodeType>([
    'repository',
    'directory',
    'module',
    'package',
    'file',
    'test',
    'config',
    'external',
  ]),
  languages: null,
  showTests: true,
  showExternal: true,
  showConfig: true,
  isolatedId: null,
  maxDepth: 6,
};

function passesTypeFilters(node: GraphNode, filters: GraphFilters): boolean {
  if (!filters.nodeTypes.has(node.type)) return false;
  if (!filters.showTests && (node.type === 'test' || node.metadata.isTest)) return false;
  if (!filters.showConfig && (node.type === 'config' || node.metadata.isConfig)) return false;
  if (!filters.showExternal && node.type === 'external') return false;
  if (filters.languages && node.language && !filters.languages.has(node.language)) return false;
  if (node.metadata.depth > filters.maxDepth && node.type !== 'external') return false;
  return true;
}

/**
 * Resolves the set of node ids a given filter state makes visible.
 * Containers survive when a visible descendant needs them, so the hierarchy
 * never breaks into floating fragments.
 */
export function selectVisibleNodes(graph: RepositoryGraph, index: GraphIndex, filters: GraphFilters): Set<string> {
  let candidates = graph.nodes.filter((node) => passesTypeFilters(node, filters));

  if (filters.isolatedId && index.nodes.has(filters.isolatedId)) {
    const keep = new Set<string>([filters.isolatedId]);
    for (const node of getDescendants(index, filters.isolatedId)) keep.add(node.id);
    for (const id of [...keep]) {
      for (const neighbour of getConnectedNodeIds(index, id)) keep.add(neighbour);
    }
    for (const ancestor of getAncestors(index, filters.isolatedId)) keep.add(ancestor.id);
    candidates = candidates.filter((node) => keep.has(node.id));
  }

  const visible = new Set(candidates.map((node) => node.id));

  // Re-attach ancestors so every visible node keeps a path to the root.
  for (const node of candidates) {
    let parentId = node.parentId;
    const guard = new Set<string>();
    while (parentId && !visible.has(parentId) && !guard.has(parentId)) {
      guard.add(parentId);
      visible.add(parentId);
      parentId = index.nodes.get(parentId)?.parentId ?? null;
    }
  }

  return visible;
}

export function selectVisibleEdges(graph: RepositoryGraph, visibleNodes: ReadonlySet<string>): GraphEdge[] {
  return graph.edges.filter((edge) => visibleNodes.has(edge.source) && visibleNodes.has(edge.target));
}

/** Nodes ranked by total dependency degree; ties broken by path for stability. */
export function rankByConnectivity(nodes: GraphNode[], limit = 5): GraphNode[] {
  return [...nodes]
    .sort((a, b) => {
      const aDegree =
        (a.metadata.incomingDependencyCount ?? 0) + (a.metadata.outgoingDependencyCount ?? 0);
      const bDegree =
        (b.metadata.incomingDependencyCount ?? 0) + (b.metadata.outgoingDependencyCount ?? 0);
      if (aDegree !== bDegree) return bDegree - aDegree;
      return a.path.localeCompare(b.path);
    })
    .slice(0, limit);
}

export function degreeOf(node: GraphNode): number {
  return (node.metadata.incomingDependencyCount ?? 0) + (node.metadata.outgoingDependencyCount ?? 0);
}

/** Top-level modules: children of the repository root that hold files. */
export function getModules(index: GraphIndex): GraphNode[] {
  if (!index.rootId) return [];
  return getChildren(index, index.rootId).filter((node) => CONTAINER_NODE_TYPES.has(node.type));
}

export function nodeDisplayPath(node: GraphNode): string {
  return node.path || node.name;
}
