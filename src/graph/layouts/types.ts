import type { EdgeType, NodeType } from '@shared/graph';

/** Compact node/edge shapes — small enough to post to a worker cheaply. */
export interface LayoutNode {
  id: string;
  type: NodeType;
  parentId: string | null;
  moduleId: string | null;
  depth: number;
  /** Relative importance: descendant files for containers, size for files. */
  weight: number;
  degree: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
}

export const LAYOUT_MODES = ['architecture', 'galaxy', 'tree', 'focus', 'flow'] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];

export interface LayoutRequest {
  mode: LayoutMode;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  rootId: string | null;
  focusId?: string | null;
  /** Overall scale multiplier. */
  spread: number;
}

export interface LayoutResult {
  ids: string[];
  /** Flat [x, y, z] triples, parallel to `ids`. */
  positions: Float32Array;
  mode: LayoutMode;
  /** Radius of the sphere that contains every node — used to fit the camera. */
  extent: number;
}

export const LAYOUT_META: Record<
  LayoutMode,
  { label: string; shortcut: string; description: string }
> = {
  architecture: {
    label: 'Architecture',
    shortcut: '1',
    description: 'Repository at the centre, modules arranged around it, hierarchy rising by depth.',
  },
  galaxy: {
    label: 'Dependency Galaxy',
    shortcut: '2',
    description: 'Force-directed clustering — files that depend on each other pull together.',
  },
  tree: {
    label: 'Tree Explorer',
    shortcut: '3',
    description: 'A spatial directory tree, descending level by level from the repository root.',
  },
  focus: {
    label: 'Focused Module',
    shortcut: '4',
    description: 'One module at the centre with its files, and its inbound and outbound dependencies on either side.',
  },
  flow: {
    label: 'Dependency Flow',
    shortcut: '5',
    description: 'Layered by dependency direction, so what depends on what reads left to right.',
  },
};
