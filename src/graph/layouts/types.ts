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

export interface LayoutMeta {
  label: string;
  shortcut: string;
  description: string;
  /**
   * Camera direction the layout reads best from, as an offset from its centre.
   * A layered flow means nothing seen end-on, and a descending tree needs a
   * near-front view to show its levels — so framing is part of the layout.
   */
  preferredView: [number, number, number];
}

export const LAYOUT_META: Record<LayoutMode, LayoutMeta> = {
  architecture: {
    label: 'Architecture',
    shortcut: '1',
    description: 'Repository at the centre, modules arranged around it, hierarchy rising by depth.',
    preferredView: [0.48, 0.72, 0.92],
  },
  galaxy: {
    label: 'Dependency Galaxy',
    shortcut: '2',
    description: 'Force-directed clustering — files that depend on each other pull together.',
    preferredView: [0.5, 0.42, 1],
  },
  tree: {
    label: 'Tree Explorer',
    shortcut: '3',
    description: 'A spatial directory tree, descending level by level from the repository root.',
    preferredView: [0.18, 0.3, 1],
  },
  focus: {
    label: 'Focused Module',
    shortcut: '4',
    description:
      'One module at the centre with its files, and its inbound and outbound dependencies on either side.',
    preferredView: [0.08, 0.5, 1],
  },
  flow: {
    label: 'Dependency Flow',
    shortcut: '5',
    description: 'Layered by dependency direction, so what depends on what reads left to right.',
    preferredView: [0.04, 0.26, 1],
  },
};
