/**
 * Focused Module layout.
 *
 * The selected container takes the centre with its own contents around it.
 * Everything that depends on it is arranged on one side, everything it depends
 * on on the other, so a module's position in the architecture is legible in a
 * single look.
 */

import { architectureLayout } from './architecture';
import { buildHierarchy, placeCone, type Vec3 } from './hierarchy';
import { placeSymbols } from './architecture';
import { stableJitter } from '../rng';
import type { LayoutRequest } from './types';

const DEPENDENCY_TYPES = new Set(['import', 'module-dependency', 'external-dependency', 'extends', 'implements', 'test-of']);

export function focusLayout(request: LayoutRequest): Map<string, Vec3> {
  const { nodes, edges, focusId, spread } = request;
  if (!focusId || !nodes.some((node) => node.id === focusId)) {
    return architectureLayout(request);
  }

  const hierarchy = buildHierarchy(nodes);
  const positions = new Map<string, Vec3>();
  const origin: Vec3 = { x: 0, y: 0, z: 0 };

  positions.set(focusId, origin);
  placeCone(
    hierarchy,
    focusId,
    origin,
    0,
    Math.PI * 2,
    { levelRadius: 8 * spread, levelHeight: 8 * spread, minSpacing: 3.6 * spread, jitter: 1 * spread },
    positions,
  );

  const inFocus = new Set(positions.keys());

  const dependents = new Set<string>();
  const dependencies = new Set<string>();
  for (const edge of edges) {
    if (!DEPENDENCY_TYPES.has(edge.type)) continue;
    if (inFocus.has(edge.source) && !inFocus.has(edge.target)) dependencies.add(edge.target);
    if (inFocus.has(edge.target) && !inFocus.has(edge.source)) dependents.add(edge.source);
  }

  placeArc([...dependents].sort(), -1, positions, spread, inFocus);
  placeArc([...dependencies].sort(), 1, positions, spread, inFocus);

  // Anything still unplaced (ancestors, unrelated survivors of the filter)
  // goes far out of the way rather than on top of the focused module.
  const remaining = nodes.filter((node) => !positions.has(node.id));
  remaining.forEach((node, index) => {
    const angle = (index / Math.max(remaining.length, 1)) * Math.PI * 2;
    const radius = 150 * spread;
    positions.set(node.id, {
      x: Math.cos(angle) * radius,
      y: 34 * spread + stableJitter(node.id, 'far') * 8,
      z: Math.sin(angle) * radius,
    });
  });

  placeSymbols(nodes, hierarchy.byId, positions, spread);
  return positions;
}

function placeArc(
  ids: string[],
  direction: -1 | 1,
  positions: Map<string, Vec3>,
  spread: number,
  skip: Set<string>,
): void {
  const members = ids.filter((id) => !skip.has(id) && !positions.has(id));
  if (members.length === 0) return;

  const columns = Math.max(1, Math.ceil(Math.sqrt(members.length)));
  const baseX = direction * 58 * spread;
  const cell = 5.4 * spread;

  members.forEach((id, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const angle = ((column - columns / 2) / Math.max(columns, 1)) * Math.PI * 0.55;
    positions.set(id, {
      x: baseX + Math.cos(angle) * 10 * spread * direction,
      y: (row - columns / 2) * cell * 0.9 + stableJitter(id, 'arc-y') * 2,
      z: Math.sin(angle) * 34 * spread,
    });
  });
}
