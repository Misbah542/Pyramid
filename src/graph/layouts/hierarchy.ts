/**
 * Shared hierarchy helpers: the radial cone placement used by the architecture
 * and tree layouts.
 */

import { stableJitter } from '../rng';
import type { LayoutNode } from './types';

/** Fraction of a wedge shared equally between siblings; the rest is weighted. */
const UNIFORM_SHARE = 0.6;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface HierarchyIndex {
  byId: Map<string, LayoutNode>;
  children: Map<string, LayoutNode[]>;
  /** Subtree weight used to allocate angular space. */
  subtreeWeight: Map<string, number>;
}

const SYMBOL_TYPES = new Set(['class', 'interface', 'function']);

export function buildHierarchy(nodes: LayoutNode[]): HierarchyIndex {
  const byId = new Map<string, LayoutNode>();
  const children = new Map<string, LayoutNode[]>();

  for (const node of nodes) byId.set(node.id, node);
  for (const node of nodes) {
    // Symbols orbit their file (see placeSymbols) rather than taking part in
    // the radial hierarchy — counting them here would distort how much angular
    // space their sibling files get.
    if (SYMBOL_TYPES.has(node.type)) continue;
    if (!node.parentId || !byId.has(node.parentId)) continue;
    const bucket = children.get(node.parentId);
    if (bucket) bucket.push(node);
    else children.set(node.parentId, [node]);
  }
  for (const bucket of children.values()) {
    bucket.sort((a, b) => a.id.localeCompare(b.id));
  }

  const subtreeWeight = new Map<string, number>();
  const weigh = (id: string, guard: Set<string>): number => {
    if (subtreeWeight.has(id)) return subtreeWeight.get(id)!;
    if (guard.has(id)) return 1;
    guard.add(id);
    const kids = children.get(id) ?? [];
    let total = 1;
    for (const child of kids) total += weigh(child.id, guard);
    subtreeWeight.set(id, total);
    return total;
  };
  for (const node of nodes) weigh(node.id, new Set());

  return { byId, children, subtreeWeight };
}

export interface ConeOptions {
  /** Minimum radial distance from a parent to its children. */
  levelRadius: number;
  /** Vertical distance per hierarchy level. Negative descends. */
  levelHeight: number;
  /**
   * Minimum arc distance between two siblings, in world units. Ring radius is
   * derived from this so a folder with forty files spreads out while a folder
   * with three stays compact — the scene keeps a constant visual density
   * instead of overlapping in dense subtrees.
   */
  minSpacing: number;
  /** Random-but-stable displacement applied to leaves, to avoid perfect rings. */
  jitter: number;
}

/**
 * Places `rootId` and everything under it as a cone of radial rings.
 * Siblings receive an angular wedge proportional to their subtree weight, so
 * a heavy module visually owns more space than a thin one.
 */
export function placeCone(
  hierarchy: HierarchyIndex,
  rootId: string,
  origin: Vec3,
  angleStart: number,
  angleEnd: number,
  options: ConeOptions,
  out: Map<string, Vec3>,
  depth = 0,
): void {
  const node = hierarchy.byId.get(rootId);
  if (!node) return;

  if (depth === 0) {
    out.set(rootId, origin);
  }

  const kids = hierarchy.children.get(rootId) ?? [];
  if (kids.length === 0) return;

  const totalWeight = kids.reduce((sum, child) => sum + (hierarchy.subtreeWeight.get(child.id) ?? 1), 0);
  const span = angleEnd - angleStart;
  const childDepth = depth + 1;

  // Angular space is shared between an equal split and a weighted one. Pure
  // weighting lets a heavy subtree squeeze its light siblings into each other;
  // the uniform half guarantees every child at least UNIFORM_SHARE/kids of the
  // wedge, which is what makes the spacing guarantee below hold.
  const minShare = UNIFORM_SHARE / kids.length;
  const requiredRadius = options.minSpacing / Math.max(minShare * span, 1e-3);
  const radius = Math.max(options.levelRadius, requiredRadius);
  const y = origin.y + options.levelHeight * childDepth;

  let cursor = angleStart;
  for (const child of kids) {
    const weight = hierarchy.subtreeWeight.get(child.id) ?? 1;
    const share = minShare + (1 - UNIFORM_SHARE) * (weight / totalWeight);
    const slice = share * span;
    const angle = cursor + slice / 2;
    const jitterR = stableJitter(child.id, 'r') * options.jitter;
    const jitterY = stableJitter(child.id, 'y') * options.jitter * 0.6;
    const r = radius + jitterR;

    const position: Vec3 = {
      x: origin.x + Math.cos(angle) * r,
      y: y + jitterY,
      z: origin.z + Math.sin(angle) * r,
    };
    out.set(child.id, position);

    // Children keep their parent's wedge, narrowed slightly so subtrees do not
    // interleave, and are re-centred on the parent's own axis.
    const inset = slice * 0.06;
    placeCone(
      hierarchy,
      child.id,
      { x: position.x, y: origin.y, z: position.z },
      cursor + inset,
      cursor + slice - inset,
      options,
      out,
      childDepth,
    );

    cursor += slice;
  }
}

/** Distributes ids evenly on a sphere shell (Fibonacci sphere). */
export function spherePositions(ids: string[], radius: number, centre: Vec3, flatten = 0.6): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  const golden = Math.PI * (3 - Math.sqrt(5));
  const count = Math.max(ids.length, 1);
  ids.forEach((id, index) => {
    const y = 1 - (index / Math.max(count - 1, 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * index;
    out.set(id, {
      x: centre.x + Math.cos(theta) * r * radius,
      y: centre.y + y * radius * flatten,
      z: centre.z + Math.sin(theta) * r * radius,
    });
  });
  return out;
}

export function extentOf(positions: Map<string, Vec3>): number {
  let max = 1;
  for (const position of positions.values()) {
    const distance = Math.hypot(position.x, position.y, position.z);
    if (distance > max) max = distance;
  }
  return max;
}

export function toResult(ids: string[], positions: Map<string, Vec3>): Float32Array {
  const array = new Float32Array(ids.length * 3);
  ids.forEach((id, index) => {
    const position = positions.get(id);
    array[index * 3] = position?.x ?? 0;
    array[index * 3 + 1] = position?.y ?? 0;
    array[index * 3 + 2] = position?.z ?? 0;
  });
  return array;
}
