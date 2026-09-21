/**
 * Tree Explorer layout.
 *
 * A strict spatial hierarchy: the repository is on top and every level of the
 * directory tree descends by a fixed step, so parent/child reads immediately.
 */

import { buildHierarchy, placeCone, spherePositions, type Vec3 } from './hierarchy';
import { placeSymbols } from './architecture';
import type { LayoutRequest } from './types';

export function treeLayout(request: LayoutRequest): Map<string, Vec3> {
  const { nodes, rootId, spread } = request;
  const positions = new Map<string, Vec3>();
  const hierarchy = buildHierarchy(nodes);

  const root = rootId ? hierarchy.byId.get(rootId) : nodes.find((node) => !node.parentId);
  if (!root) return positions;

  const origin: Vec3 = { x: 0, y: 34 * spread, z: 0 };
  positions.set(root.id, origin);

  placeCone(
    hierarchy,
    root.id,
    origin,
    0,
    Math.PI * 2,
    {
      levelRadius: 9 * spread,
      levelHeight: -11 * spread,
      minSpacing: 3.6 * spread,
      jitter: 0.9 * spread,
    },
    positions,
  );

  placeSymbols(nodes, hierarchy.byId, positions, spread);

  const externals = nodes.filter((node) => node.type === 'external');
  if (externals.length) {
    const shell = spherePositions(
      externals.map((node) => node.id),
      (52 + externals.length * 0.45) * spread,
      { x: 0, y: -26 * spread, z: 0 },
      0.3,
    );
    for (const [id, position] of shell) positions.set(id, position);
  }

  return positions;
}
