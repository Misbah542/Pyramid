/**
 * Architecture layout — the default.
 *
 * The repository sits at the origin. Top-level modules are distributed on a
 * ring around it, sized by how much code they contain, and each module grows
 * upward as a cone of its own subdirectories and files. External packages form
 * an outer shell so third-party surface area is visible at a glance.
 */

import { buildHierarchy, extentOf, placeCone, spherePositions, type Vec3 } from './hierarchy';
import { stableJitter } from '../rng';
import type { LayoutNode, LayoutRequest } from './types';

export function architectureLayout(request: LayoutRequest): Map<string, Vec3> {
  const { nodes, rootId, spread } = request;
  const positions = new Map<string, Vec3>();
  const hierarchy = buildHierarchy(nodes);

  const externals = nodes.filter((node) => node.type === 'external');
  const internal = nodes.filter((node) => node.type !== 'external');

  const root = rootId ? hierarchy.byId.get(rootId) : null;
  const modules = root
    ? (hierarchy.children.get(root.id) ?? [])
    : internal.filter((node) => !node.parentId);

  if (root) positions.set(root.id, { x: 0, y: 0, z: 0 });

  const containerModules = modules.filter((node) => isContainer(node));
  const looseFiles = modules.filter((node) => !isContainer(node));

  const totalWeight = containerModules.reduce((sum, node) => sum + Math.max(node.weight, 1), 0) || 1;
  const ringRadius = (20 + containerModules.length * 2.6) * spread;

  let angleCursor = -Math.PI / 2;
  for (const module of containerModules) {
    const share = Math.max(module.weight, 1) / totalWeight;
    const slice = share * Math.PI * 2;
    const angle = angleCursor + slice / 2;
    // Heavier modules sit slightly further out so the ring does not crowd.
    const radius = ringRadius * (0.82 + share * 0.9);
    const origin: Vec3 = {
      x: Math.cos(angle) * radius,
      y: stableJitter(module.id, 'module-y') * 3,
      z: Math.sin(angle) * radius,
    };
    positions.set(module.id, origin);

    placeCone(
      hierarchy,
      module.id,
      origin,
      angle - slice / 2 + slice * 0.08,
      angle + slice / 2 - slice * 0.08,
      {
        levelRadius: 7 * spread,
        levelHeight: 10 * spread,
        minSpacing: 3.4 * spread,
        jitter: 1.1 * spread,
      },
      positions,
    );

    angleCursor += slice;
  }

  // Files that live at the repository root orbit close to the centre.
  looseFiles.forEach((file, index) => {
    const angle = (index / Math.max(looseFiles.length, 1)) * Math.PI * 2;
    const radius = 9 * spread;
    positions.set(file.id, {
      x: Math.cos(angle) * radius,
      y: -7 * spread + stableJitter(file.id, 'loose') * 1.5,
      z: Math.sin(angle) * radius,
    });
  });

  // Symbol nodes cluster tightly around the file that declares them.
  placeSymbols(nodes, hierarchy.byId, positions, spread);

  if (externals.length) {
    const shellRadius = (ringRadius + 26 + externals.length * 0.35) * spread;
    const byEcosystem = spherePositions(
      externals.map((node) => node.id),
      shellRadius,
      { x: 0, y: 6 * spread, z: 0 },
      0.42,
    );
    for (const [id, position] of byEcosystem) positions.set(id, position);
  }

  return positions;
}

function isContainer(node: LayoutNode): boolean {
  return node.type === 'directory' || node.type === 'module' || node.type === 'package';
}

/** Symbols orbit their file in a small ring — visible only when zoomed in. */
export function placeSymbols(
  nodes: LayoutNode[],
  byId: Map<string, LayoutNode>,
  positions: Map<string, Vec3>,
  spread: number,
): void {
  const symbolsByFile = new Map<string, LayoutNode[]>();
  for (const node of nodes) {
    if (node.type !== 'class' && node.type !== 'interface' && node.type !== 'function') continue;
    if (!node.parentId || !byId.has(node.parentId)) continue;
    const bucket = symbolsByFile.get(node.parentId);
    if (bucket) bucket.push(node);
    else symbolsByFile.set(node.parentId, [node]);
  }

  for (const [fileId, symbols] of symbolsByFile) {
    const anchor = positions.get(fileId);
    if (!anchor) continue;
    const radius = (2.2 + symbols.length * 0.26) * spread;
    symbols.forEach((symbol, index) => {
      const angle = (index / symbols.length) * Math.PI * 2;
      positions.set(symbol.id, {
        x: anchor.x + Math.cos(angle) * radius,
        y: anchor.y + 2.4 * spread + stableJitter(symbol.id, 'sym') * 0.7,
        z: anchor.z + Math.sin(angle) * radius,
      });
    });
  }
}

export { extentOf };
