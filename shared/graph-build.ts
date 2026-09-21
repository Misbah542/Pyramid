/**
 * Derived-count computation shared by the live analyser and the demo graph, so
 * both produce identically shaped metadata.
 */

import type { GraphEdge, GraphNode } from './graph';
import { DEPENDENCY_EDGE_TYPES, FILE_NODE_TYPES } from './graph-utils';

export function annotateDerivedCounts(nodes: GraphNode[], edges: GraphEdge[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  const childCounts = new Map<string, number>();

  for (const edge of edges) {
    if (!DEPENDENCY_EDGE_TYPES.has(edge.type)) continue;
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  for (const node of nodes) {
    if (node.parentId) childCounts.set(node.parentId, (childCounts.get(node.parentId) ?? 0) + 1);
  }

  for (const node of nodes) {
    node.metadata.incomingDependencyCount = incoming.get(node.id) ?? 0;
    node.metadata.outgoingDependencyCount = outgoing.get(node.id) ?? 0;
    node.metadata.childCount = childCounts.get(node.id) ?? 0;
  }

  for (const node of nodes) {
    if (!FILE_NODE_TYPES.has(node.type)) continue;
    let parentId = node.parentId;
    const guard = new Set<string>();
    while (parentId && !guard.has(parentId)) {
      guard.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      parent.metadata.descendantFileCount = (parent.metadata.descendantFileCount ?? 0) + 1;
      parent.metadata.descendantByteSize =
        (parent.metadata.descendantByteSize ?? 0) + (node.metadata.byteSize ?? 0);
      if (node.language) {
        const mix = (parent.metadata.languageMix ??= {});
        mix[node.language] = (mix[node.language] ?? 0) + 1;
      }
      parentId = parent.parentId;
    }
  }
}
