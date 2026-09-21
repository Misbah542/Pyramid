/**
 * Dependency Flow layout.
 *
 * Nodes are assigned to layers by how deep they sit in the dependency graph,
 * then laid out left-to-right. Reading direction is the point: anything on the
 * left depends on what is to its right.
 *
 * This describes *static* import direction only — it is not an execution trace.
 */

import { stableJitter } from '../rng';
import type { Vec3 } from './hierarchy';
import type { LayoutRequest } from './types';

const DEPENDENCY_TYPES = new Set(['import', 'module-dependency', 'external-dependency', 'extends', 'implements', 'test-of']);

export function flowLayout(request: LayoutRequest): Map<string, Vec3> {
  const { nodes, edges, spread } = request;
  const positions = new Map<string, Vec3>();

  const ids = nodes.map((node) => node.id);
  const nodeSet = new Set(ids);
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of ids) indegree.set(id, 0);

  for (const edge of edges) {
    if (!DEPENDENCY_TYPES.has(edge.type)) continue;
    if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) continue;
    const bucket = outgoing.get(edge.source);
    if (bucket) bucket.push(edge.target);
    else outgoing.set(edge.source, [edge.target]);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  // Longest-path layering with a visit cap so cycles cannot loop forever.
  const layer = new Map<string, number>();
  for (const id of ids) layer.set(id, 0);

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  const visits = new Map<string, number>();
  let cursor = 0;
  while (cursor < queue.length) {
    const id = queue[cursor];
    cursor += 1;
    const seen = (visits.get(id) ?? 0) + 1;
    visits.set(id, seen);
    if (seen > 3) continue;
    const currentLayer = layer.get(id) ?? 0;
    for (const target of outgoing.get(id) ?? []) {
      if ((layer.get(target) ?? 0) < currentLayer + 1) {
        layer.set(target, currentLayer + 1);
        queue.push(target);
      }
    }
  }

  const byLayer = new Map<number, string[]>();
  let maxLayer = 0;
  for (const id of ids) {
    const value = Math.min(layer.get(id) ?? 0, 14);
    maxLayer = Math.max(maxLayer, value);
    const bucket = byLayer.get(value);
    if (bucket) bucket.push(id);
    else byLayer.set(value, [id]);
  }

  const moduleOf = new Map(nodes.map((node) => [node.id, node.moduleId ?? 'root']));
  const layerGap = 26 * spread;
  const offsetX = ((maxLayer + 1) * layerGap) / 2;

  for (const [layerIndex, members] of byLayer) {
    // Group by module inside a layer so related files stay adjacent.
    members.sort((a, b) => {
      const moduleCompare = (moduleOf.get(a) ?? '').localeCompare(moduleOf.get(b) ?? '');
      return moduleCompare !== 0 ? moduleCompare : a.localeCompare(b);
    });

    const columns = Math.max(1, Math.ceil(Math.sqrt(members.length)));
    const cell = 5.6 * spread;
    members.forEach((id, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      positions.set(id, {
        x: layerIndex * layerGap - offsetX,
        y: (row - columns / 2) * cell + stableJitter(id, 'flow-y') * 1.4,
        z: (column - columns / 2) * cell + stableJitter(id, 'flow-z') * 1.4,
      });
    });
  }

  return positions;
}
