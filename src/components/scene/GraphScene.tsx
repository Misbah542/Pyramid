/**
 * The 3D workspace scene.
 *
 * Owns the WebGL canvas, the animated position buffer, and the wiring between
 * store state and the renderer. Everything expensive (instancing, edge
 * geometry, label budgeting) lives in the children; this file keeps the
 * plumbing readable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, AdaptiveEvents, Grid, Preload } from '@react-three/drei';
import { Color, FogExp2, type PerspectiveCamera } from 'three';
import type { GraphNode } from '@shared/graph';
import { LAYOUT_META } from '@/graph/layouts';
import { computeHighlightedIds, useWorkspaceStore } from '@/store/useWorkspaceStore';
import { usePrefersReducedMotion, useSettingsStore } from '@/store/useSettingsStore';
import { readScenePalette } from '@/lib/theme';
import { CameraRig } from './CameraRig';
import { GraphEdges } from './GraphEdges';
import { GraphNodes } from './GraphNodes';
import { PositionBuffer } from './positionBuffer';
import { SceneLabels } from './SceneLabels';
import { SelectionHalo } from './SelectionHalo';
import { radiusFor } from './nodeVisuals';

export interface GraphSceneProps {
  /** Raised when sustained frame times suggest the scene is too heavy. */
  onPerformanceWarning?: (slow: boolean) => void;
}

export function GraphScene({ onPerformanceWarning }: GraphSceneProps) {
  const graph = useWorkspaceStore((state) => state.graph);
  const visibleNodeIds = useWorkspaceStore((state) => state.visibleNodeIds);
  const visibleEdges = useWorkspaceStore((state) => state.visibleEdges);
  const layout = useWorkspaceStore((state) => state.layout);
  const selectedId = useWorkspaceStore((state) => state.selectedId);
  const hoveredId = useWorkspaceStore((state) => state.hoveredId);
  const pinnedIds = useWorkspaceStore((state) => state.pinnedIds);
  const tracedPath = useWorkspaceStore((state) => state.tracedPath);
  const camera = useWorkspaceStore((state) => state.camera);
  const select = useWorkspaceStore((state) => state.select);
  const hover = useWorkspaceStore((state) => state.hover);
  const focusNode = useWorkspaceStore((state) => state.focusNode);

  const theme = useSettingsStore((state) => state.theme);
  const showLabels = useSettingsStore((state) => state.showLabels);
  const showEdges = useSettingsStore((state) => state.showEdges);
  const showHierarchyEdges = useSettingsStore((state) => state.showHierarchyEdges);
  const showExternalEdges = useSettingsStore((state) => state.showExternalEdges);
  const showGrid = useSettingsStore((state) => state.showGrid);
  const labelBudget = useSettingsStore((state) => state.labelBudget);
  const quality = useSettingsStore((state) => state.quality);
  const reducedMotion = usePrefersReducedMotion();

  const palette = useMemo(() => readScenePalette(theme), [theme]);
  const buffer = useRef(new PositionBuffer()).current;

  const nodes = useMemo(
    () => (graph ? graph.nodes.filter((node) => visibleNodeIds.has(node.id)) : []),
    [graph, visibleNodeIds],
  );

  const radiusById = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of nodes) map.set(node.id, radiusFor(node));
    return map;
  }, [nodes]);

  const radiusOf = useCallback((id: string) => radiusById.get(id) ?? 0.6, [radiusById]);

  const index = useWorkspaceStore((state) => state.index);
  const highlighted = useMemo(
    () => computeHighlightedIds(index, hoveredId ?? selectedId, tracedPath),
    [index, hoveredId, selectedId, tracedPath],
  );
  const tracedEdgeIds = useMemo(() => new Set((tracedPath ?? []).map((edge) => edge.id)), [tracedPath]);

  const [gridY, setGridY] = useState(-24);
  const lastFitted = useRef<string | null>(null);
  const frameView = useWorkspaceStore((state) => state.frameView);

  useEffect(() => {
    if (!layout) return;
    buffer.setTarget(layout.ids, layout.positions, reducedMotion);

    let min = 0;
    for (let i = 1; i < layout.positions.length; i += 3) {
      if (layout.positions[i] < min) min = layout.positions[i];
    }
    setGridY(min - Math.max(8, layout.extent * 0.06));

    // Re-frame when the arrangement itself changes — the first layout of a
    // repository, or a switch to a different layout mode. Filter changes keep
    // the camera where the user put it.
    const signature = `${graph?.repository.fullName ?? ''}:${layout.mode}`;
    if (lastFitted.current !== signature) {
      lastFitted.current = signature;
      frameView(LAYOUT_META[layout.mode].preferredView);
    }
  }, [layout, buffer, reducedMotion, graph, frameView]);

  const dpr = useMemo<[number, number]>(() => {
    if (quality === 'high') return [1, 2];
    if (quality === 'balanced') return [0.75, 1.25];
    return [0.8, 1.75];
  }, [quality]);

  const nodeCount = nodes.length;

  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: quality !== 'balanced', powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 46, near: 0.5, far: 6000, position: [62, 92, 118] }}
      onPointerMissed={(event) => {
        if ((event as MouseEvent).type === 'click') select(null);
      }}
      className="h-full w-full"
    >
      <SceneEnvironment palette={palette} extent={layout?.extent ?? 120} />
      <PerformanceWatcher onWarning={onPerformanceWarning} />

      <ambientLight intensity={theme === 'dark' ? 0.75 : 1.1} />
      <hemisphereLight args={[palette.accent, palette.background, theme === 'dark' ? 0.5 : 0.7]} />
      <directionalLight position={[120, 180, 90]} intensity={theme === 'dark' ? 1.5 : 1.9} />
      <directionalLight position={[-140, -60, -110]} intensity={0.45} color={palette.nodes.package} />

      {showGrid ? (
        <Grid
          position={[0, gridY, 0]}
          args={[10, 10]}
          cellSize={14}
          cellThickness={0.6}
          sectionSize={70}
          sectionThickness={1}
          cellColor={palette.grid}
          sectionColor={palette.grid}
          fadeDistance={760}
          fadeStrength={1.4}
          infiniteGrid
          followCamera={false}
        />
      ) : null}

      <GraphNodes
        nodes={nodes}
        buffer={buffer}
        palette={palette}
        highlighted={highlighted}
        selectedId={selectedId}
        pinnedIds={pinnedIds}
        hoveredId={hoveredId}
        dimUnrelated={Boolean(selectedId ?? hoveredId)}
        animate={!reducedMotion}
        onHover={hover}
        onSelect={(id, additive) => select(id, { additive })}
        onActivate={focusNode}
      />

      {showEdges ? (
        <GraphEdges
          edges={visibleEdges}
          buffer={buffer}
          palette={palette}
          selectedId={selectedId}
          hoveredId={hoveredId}
          highlighted={highlighted}
          tracedEdgeIds={tracedEdgeIds}
          dimUnrelated={Boolean(selectedId ?? hoveredId)}
          animate={!reducedMotion}
          showHierarchy={showHierarchyEdges}
          showExternal={showExternalEdges}
        />
      ) : null}

      <SelectionHalo
        buffer={buffer}
        palette={palette}
        selectedId={selectedId}
        hoveredId={hoveredId}
        pinnedIds={pinnedIds}
        radiusOf={radiusOf}
        animate={!reducedMotion}
      />

      {showLabels ? (
        <SceneLabels
          nodes={nodes}
          buffer={buffer}
          budget={Math.max(8, Math.min(labelBudget, nodeCount))}
          selectedId={selectedId}
          hoveredId={hoveredId}
          pinnedIds={pinnedIds}
        />
      ) : null}

      <CameraRig command={camera} buffer={buffer} animate={!reducedMotion} radiusOf={radiusOf} />

      <AdaptiveDpr pixelated={false} />
      <AdaptiveEvents />
      <Preload all />
    </Canvas>
  );
}

/**
 * Background, fog and field of view.
 *
 * Fog density is derived from how big the graph actually is. A fixed density
 * either does nothing on a small repository or swallows a large one whole —
 * and on a narrow portrait viewport, where fitting the graph pushes the camera
 * much further back, a fixed value turns the whole scene black.
 */
function SceneEnvironment({
  palette,
  extent,
}: {
  palette: { background: string; fog: string };
  extent: number;
}) {
  const { scene, camera, size } = useThree();

  useEffect(() => {
    scene.background = new Color(palette.background);
    const density = 0.12 / Math.max(extent, 24);
    scene.fog = new FogExp2(new Color(palette.fog).getHex(), density);
    return () => {
      scene.fog = null;
    };
  }, [scene, palette, extent]);

  useEffect(() => {
    const perspective = camera as PerspectiveCamera;
    if (!perspective.isPerspectiveCamera) return;
    // A portrait viewport needs a wider lens, or fitting the graph puts the
    // camera so far away that everything is a speck.
    const aspect = size.width / Math.max(size.height, 1);
    const fov = aspect < 0.85 ? 62 : aspect < 1.2 ? 52 : 46;
    if (perspective.fov !== fov) {
      perspective.fov = fov;
      perspective.updateProjectionMatrix();
    }
  }, [camera, size]);

  return null;
}

/**
 * Watches frame times and reports sustained slowness, so the workspace can
 * suggest reducing detail instead of silently stuttering.
 */
function PerformanceWatcher({ onWarning }: { onWarning?: (slow: boolean) => void }) {
  const samples = useRef<number[]>([]);
  const reported = useRef(false);

  useFrame((_, delta) => {
    if (!onWarning) return;
    samples.current.push(delta);
    if (samples.current.length < 90) return;

    const average = samples.current.reduce((sum, value) => sum + value, 0) / samples.current.length;
    samples.current = [];

    const slow = average > 1 / 24;
    if (slow !== reported.current) {
      reported.current = slow;
      onWarning(slow);
    }
  });

  return null;
}

export type { GraphNode };
