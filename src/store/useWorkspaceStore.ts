/**
 * Workspace state: the loaded graph, what is selected, what is visible and
 * where the camera has been asked to go.
 *
 * Rendering state (positions, camera) is deliberately kept apart from UI state
 * so panel interactions never force a layout recomputation, and vice versa.
 */

import { create } from 'zustand';
import type { GraphEdge, GraphNode, NodeType, RepositoryGraph } from '@shared/graph';
import {
  buildGraphIndex,
  DEFAULT_FILTERS,
  findDependencyPath,
  getAncestors,
  getConnectedNodeIds,
  selectVisibleEdges,
  selectVisibleNodes,
  type GraphFilters,
  type GraphIndex,
} from '@shared/graph-utils';
import type { LayoutMode, LayoutNode, LayoutEdge, LayoutResult } from '@/graph/layouts';
import { runLayout } from '@/graph/layout-runner';

export type GraphSource = 'demo' | 'live';

export type CameraCommand =
  | { kind: 'focus'; nodeId: string; seq: number }
  | { kind: 'fit'; seq: number }
  /** Fit the graph *and* move to a given viewing direction. */
  | { kind: 'frame'; direction: [number, number, number]; seq: number }
  | { kind: 'reset'; seq: number };

export interface WorkspaceState {
  graph: RepositoryGraph | null;
  index: GraphIndex | null;
  source: GraphSource;

  layoutMode: LayoutMode;
  layout: LayoutResult | null;
  layoutPending: boolean;
  layoutError: string | null;

  filters: GraphFilters;
  visibleNodeIds: Set<string>;
  visibleEdges: GraphEdge[];

  selectedId: string | null;
  /** Additional nodes added with shift-click. */
  pinnedIds: string[];
  hoveredId: string | null;
  expandedIds: Set<string>;
  tracedPath: GraphEdge[] | null;
  traceFromId: string | null;

  camera: CameraCommand | null;
  paletteOpen: boolean;
  insightsOpen: boolean;
  explorerOpen: boolean;
  inspectorOpen: boolean;

  /* actions */
  loadGraph: (graph: RepositoryGraph, source: GraphSource) => void;
  clearGraph: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  recomputeLayout: () => void;
  setFilters: (patch: Partial<GraphFilters>) => void;
  toggleNodeType: (type: NodeType) => void;
  select: (id: string | null, options?: { additive?: boolean; focus?: boolean }) => void;
  hover: (id: string | null) => void;
  toggleExpanded: (id: string) => void;
  expandTo: (id: string) => void;
  isolate: (id: string | null) => void;
  focusNode: (id: string) => void;
  fitView: () => void;
  frameView: (direction: [number, number, number]) => void;
  resetCamera: () => void;
  traceTo: (targetId: string) => void;
  clearTrace: () => void;
  setPaletteOpen: (open: boolean) => void;
  togglePanel: (panel: 'insights' | 'explorer' | 'inspector') => void;
}

let cameraSeq = 0;
let layoutToken = 0;

type CameraRequest =
  | { kind: 'focus'; nodeId: string }
  | { kind: 'fit' }
  | { kind: 'frame'; direction: [number, number, number] }
  | { kind: 'reset' };

const nextCamera = (command: CameraRequest): CameraCommand => {
  cameraSeq += 1;
  if (command.kind === 'focus') return { kind: 'focus', nodeId: command.nodeId, seq: cameraSeq };
  if (command.kind === 'frame') return { kind: 'frame', direction: command.direction, seq: cameraSeq };
  return { kind: command.kind, seq: cameraSeq };
};

function toLayoutNodes(nodes: GraphNode[]): LayoutNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    parentId: node.parentId,
    moduleId: node.moduleId,
    depth: node.metadata.depth,
    weight:
      node.metadata.descendantFileCount ??
      (node.metadata.byteSize ? Math.max(1, Math.round(node.metadata.byteSize / 2048)) : 1),
    degree: (node.metadata.incomingDependencyCount ?? 0) + (node.metadata.outgoingDependencyCount ?? 0),
  }));
}

function toLayoutEdges(edges: GraphEdge[]): LayoutEdge[] {
  return edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    type: edge.type,
    weight: edge.metadata?.weight ?? 1,
  }));
}

/** Chooses a starting depth so very large repositories open at module level. */
function initialMaxDepth(graph: RepositoryGraph): number {
  if (graph.metadata.fileCount > 2200) return 2;
  if (graph.metadata.fileCount > 900) return 3;
  if (graph.metadata.fileCount > 320) return 4;
  return 8;
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  const applyVisibility = (graph: RepositoryGraph, index: GraphIndex, filters: GraphFilters) => {
    const visibleNodeIds = selectVisibleNodes(graph, index, filters);
    const visibleEdges = selectVisibleEdges(graph, visibleNodeIds);
    return { visibleNodeIds, visibleEdges };
  };

  const scheduleLayout = () => {
    const { graph, index, filters, layoutMode, visibleNodeIds, visibleEdges } = get();
    if (!graph || !index) return;

    layoutToken += 1;
    const token = layoutToken;
    set({ layoutPending: true, layoutError: null });

    const nodes = graph.nodes.filter((node) => visibleNodeIds.has(node.id));

    void runLayout({
      mode: layoutMode,
      nodes: toLayoutNodes(nodes),
      edges: toLayoutEdges(visibleEdges),
      rootId: index.rootId,
      focusId: filters.isolatedId ?? get().selectedId,
      spread: nodes.length > 1600 ? 1.35 : nodes.length > 600 ? 1.15 : 1,
    })
      .then((result) => {
        if (token !== layoutToken) return;
        set({ layout: result, layoutPending: false });
      })
      .catch((error: unknown) => {
        if (token !== layoutToken) return;
        set({
          layoutPending: false,
          layoutError: error instanceof Error ? error.message : 'Layout failed',
        });
      });
  };

  return {
    graph: null,
    index: null,
    source: 'demo',

    layoutMode: 'architecture',
    layout: null,
    layoutPending: false,
    layoutError: null,

    filters: DEFAULT_FILTERS,
    visibleNodeIds: new Set<string>(),
    visibleEdges: [],

    selectedId: null,
    pinnedIds: [],
    hoveredId: null,
    expandedIds: new Set<string>(),
    tracedPath: null,
    traceFromId: null,

    camera: null,
    paletteOpen: false,
    insightsOpen: false,
    explorerOpen: true,
    inspectorOpen: true,

    loadGraph: (graph, source) => {
      const index = buildGraphIndex(graph);
      const filters: GraphFilters = { ...DEFAULT_FILTERS, maxDepth: initialMaxDepth(graph) };
      const { visibleNodeIds, visibleEdges } = applyVisibility(graph, index, filters);

      const expanded = new Set<string>();
      if (index.rootId) expanded.add(index.rootId);
      for (const child of index.children.get(index.rootId ?? '') ?? []) expanded.add(child);

      set({
        graph,
        index,
        source,
        filters,
        visibleNodeIds,
        visibleEdges,
        expandedIds: expanded,
        selectedId: null,
        pinnedIds: [],
        hoveredId: null,
        tracedPath: null,
        traceFromId: null,
        layout: null,
        layoutMode: 'architecture',
        camera: nextCamera({ kind: 'reset' }),
      });
      scheduleLayout();
    },

    clearGraph: () =>
      set({
        graph: null,
        index: null,
        layout: null,
        visibleNodeIds: new Set(),
        visibleEdges: [],
        selectedId: null,
        pinnedIds: [],
        hoveredId: null,
      }),

    setLayoutMode: (mode) => {
      if (get().layoutMode === mode) return;
      set({ layoutMode: mode });
      scheduleLayout();
    },

    recomputeLayout: scheduleLayout,

    setFilters: (patch) => {
      const { graph, index, filters } = get();
      const next = { ...filters, ...patch };
      set({ filters: next });
      if (!graph || !index) return;
      set(applyVisibility(graph, index, next));
      scheduleLayout();
    },

    toggleNodeType: (type) => {
      const { filters } = get();
      const nodeTypes = new Set(filters.nodeTypes);
      if (nodeTypes.has(type)) nodeTypes.delete(type);
      else nodeTypes.add(type);
      get().setFilters({ nodeTypes });
    },

    select: (id, options) => {
      const { selectedId, pinnedIds } = get();
      if (options?.additive && id) {
        const alreadyPinned = pinnedIds.includes(id);
        set({
          pinnedIds: alreadyPinned ? pinnedIds.filter((pinned) => pinned !== id) : [...pinnedIds, id].slice(-8),
        });
        return;
      }
      if (id === selectedId && !options?.focus) return;
      set({ selectedId: id, tracedPath: null, inspectorOpen: id ? true : get().inspectorOpen });
      if (id && options?.focus) set({ camera: nextCamera({ kind: 'focus', nodeId: id }) });
    },

    hover: (id) => {
      if (get().hoveredId === id) return;
      set({ hoveredId: id });
    },

    toggleExpanded: (id) => {
      const expandedIds = new Set(get().expandedIds);
      if (expandedIds.has(id)) expandedIds.delete(id);
      else expandedIds.add(id);
      set({ expandedIds });
    },

    expandTo: (id) => {
      const { index } = get();
      if (!index) return;
      const expandedIds = new Set(get().expandedIds);
      for (const ancestor of getAncestors(index, id)) expandedIds.add(ancestor.id);
      expandedIds.add(id);
      set({ expandedIds });
    },

    isolate: (id) => {
      get().setFilters({ isolatedId: id });
      if (id) {
        set({ layoutMode: 'focus' });
        scheduleLayout();
        set({ camera: nextCamera({ kind: 'fit' }) });
      }
    },

    focusNode: (id) => {
      const { index } = get();
      if (index && !get().visibleNodeIds.has(id)) {
        // Reveal the node's branch before pointing the camera at it.
        const depth = index.nodes.get(id)?.metadata.depth ?? 0;
        if (depth > get().filters.maxDepth) get().setFilters({ maxDepth: Math.min(12, depth + 1) });
      }
      set({ selectedId: id, camera: nextCamera({ kind: 'focus', nodeId: id }), inspectorOpen: true });
      get().expandTo(id);
    },

    fitView: () => set({ camera: nextCamera({ kind: 'fit' }) }),
    frameView: (direction) => set({ camera: nextCamera({ kind: 'frame', direction }) }),
    resetCamera: () => set({ camera: nextCamera({ kind: 'reset' }) }),

    traceTo: (targetId) => {
      const { index, selectedId } = get();
      if (!index || !selectedId) return;
      const path = findDependencyPath(index, selectedId, targetId);
      set({ tracedPath: path, traceFromId: selectedId });
    },

    clearTrace: () => set({ tracedPath: null, traceFromId: null }),

    setPaletteOpen: (open) => set({ paletteOpen: open }),

    togglePanel: (panel) =>
      set((state) => {
        if (panel === 'insights') return { insightsOpen: !state.insightsOpen };
        if (panel === 'explorer') return { explorerOpen: !state.explorerOpen };
        return { inspectorOpen: !state.inspectorOpen };
      }),
  };
});

/* ------------------------------------------------------------------ *
 * Selectors
 * ------------------------------------------------------------------ */

export function useSelectedNode(): GraphNode | null {
  return useWorkspaceStore((state) => (state.selectedId ? (state.index?.nodes.get(state.selectedId) ?? null) : null));
}

export function useHoveredNode(): GraphNode | null {
  return useWorkspaceStore((state) => (state.hoveredId ? (state.index?.nodes.get(state.hoveredId) ?? null) : null));
}

/**
 * Nodes connected to the current selection — drives scene highlighting.
 *
 * Deliberately a plain function rather than a store selector: it allocates a
 * new Set, and a selector that never returns a stable reference would make
 * every store update re-render the scene.
 */
export function computeHighlightedIds(
  index: GraphIndex | null,
  anchorId: string | null,
  tracedPath: GraphEdge[] | null,
): Set<string> {
  const highlighted = new Set<string>();
  if (!anchorId || !index) return highlighted;
  highlighted.add(anchorId);
  for (const id of getConnectedNodeIds(index, anchorId)) highlighted.add(id);
  if (tracedPath) {
    for (const edge of tracedPath) {
      highlighted.add(edge.source);
      highlighted.add(edge.target);
    }
  }
  return highlighted;
}
