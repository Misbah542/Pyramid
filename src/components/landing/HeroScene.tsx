/**
 * Hero visualisation.
 *
 * Deliberately not a decorative particle field: this renders the demo
 * repository through the same instanced renderer and the same architecture
 * layout the workspace uses, trimmed to its top levels. What you see on the
 * landing page is what the product actually draws.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Color, FogExp2, Group } from 'three';
import type { GraphEdge, GraphNode } from '@shared/graph';
import { createDemoGraph } from '@/demo/demo-graph';
import { computeLayout } from '@/graph/layouts';
import { readScenePalette } from '@/lib/theme';
import { detectWebGL } from '@/lib/webgl';
import { usePrefersReducedMotion, useSettingsStore } from '@/store/useSettingsStore';
import { GraphEdges } from '@/components/scene/GraphEdges';
import { GraphNodes } from '@/components/scene/GraphNodes';
import { PositionBuffer } from '@/components/scene/positionBuffer';

const MAX_DEPTH = 3;
const EMPTY = new Set<string>();

function useHeroGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return useMemo(() => {
    const graph = createDemoGraph();
    const keep = new Set<string>();
    const nodes = graph.nodes.filter((node) => {
      if (node.type === 'class' || node.type === 'interface' || node.type === 'function') return false;
      if (node.type === 'external') return (node.metadata.incomingDependencyCount ?? 0) >= 3;
      if (node.metadata.depth > MAX_DEPTH) return false;
      return true;
    });
    for (const node of nodes) keep.add(node.id);
    const edges = graph.edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target));
    return { nodes, edges };
  }, []);
}

export function HeroScene({ className }: { className?: string }) {
  const webgl = useMemo(() => detectWebGL(), []);
  if (!webgl.supported) return <HeroFallback className={className} />;

  return (
    <div className={className} aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ fov: 42, position: [96, 58, 122], near: 1, far: 3000 }}
        style={{ pointerEvents: 'none' }}
        frameloop="always"
      >
        <HeroContent />
      </Canvas>
    </div>
  );
}

function HeroContent() {
  const theme = useSettingsStore((state) => state.theme);
  const reducedMotion = usePrefersReducedMotion();
  const palette = useMemo(() => readScenePalette(theme), [theme]);
  const { nodes, edges } = useHeroGraph();
  const buffer = useRef(new PositionBuffer()).current;
  const spin = useRef<Group>(null);

  const layout = useMemo(
    () =>
      computeLayout({
        mode: 'architecture',
        rootId: 'repo',
        spread: 1,
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type,
          parentId: node.parentId,
          moduleId: node.moduleId,
          depth: node.metadata.depth,
          weight: node.metadata.descendantFileCount ?? 1,
          degree: (node.metadata.incomingDependencyCount ?? 0) + (node.metadata.outgoingDependencyCount ?? 0),
        })),
        edges: edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          type: edge.type,
          weight: edge.metadata?.weight ?? 1,
        })),
      }),
    [nodes, edges],
  );

  useEffect(() => {
    buffer.setTarget(layout.ids, layout.positions, reducedMotion);
  }, [buffer, layout, reducedMotion]);

  useFrame((state, delta) => {
    state.scene.background = null;
    if (!state.scene.fog) state.scene.fog = new FogExp2(new Color(palette.fog).getHex(), 0.0022);
    if (spin.current && !reducedMotion) spin.current.rotation.y += delta * 0.045;
  });

  return (
    <>
      <ambientLight intensity={0.8} />
      <hemisphereLight args={[palette.accent, palette.background, 0.5]} />
      <directionalLight position={[120, 180, 90]} intensity={1.5} />
      <directionalLight position={[-140, -60, -110]} intensity={0.4} color={palette.nodes.package} />

      <group ref={spin}>
        <GraphNodes
          nodes={nodes}
          buffer={buffer}
          palette={palette}
          highlighted={EMPTY}
          selectedId={null}
          pinnedIds={[]}
          hoveredId={null}
          dimUnrelated={false}
          animate={!reducedMotion}
          onHover={() => {}}
          onSelect={() => {}}
          onActivate={() => {}}
        />
        <GraphEdges
          edges={edges}
          buffer={buffer}
          palette={palette}
          selectedId={null}
          hoveredId={null}
          highlighted={EMPTY}
          tracedEdgeIds={EMPTY}
          dimUnrelated={false}
          animate={!reducedMotion}
          showHierarchy
          showExternal
        />
      </group>
    </>
  );
}

/** Static composition used when WebGL is unavailable. */
function HeroFallback({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="flex h-full w-full items-center justify-center">
        <svg viewBox="0 0 400 320" className="h-full w-full max-w-lg opacity-70">
          <g stroke="hsl(var(--scene-edge))" strokeWidth="0.75" opacity="0.5">
            {[
              [200, 160, 90, 90],
              [200, 160, 310, 90],
              [200, 160, 90, 230],
              [200, 160, 310, 230],
              [200, 160, 200, 60],
              [90, 90, 310, 90],
              [90, 230, 310, 230],
            ].map(([x1, y1, x2, y2], index) => (
              <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
          </g>
          <circle cx="200" cy="160" r="12" fill="hsl(var(--n-repository))" />
          {[
            [90, 90, 'directory'],
            [310, 90, 'package'],
            [90, 230, 'test'],
            [310, 230, 'interface'],
            [200, 60, 'external'],
          ].map(([x, y, type], index) => (
            <circle key={index} cx={x as number} cy={y as number} r="7" fill={`hsl(var(--n-${type}))`} />
          ))}
        </svg>
      </div>
    </div>
  );
}
