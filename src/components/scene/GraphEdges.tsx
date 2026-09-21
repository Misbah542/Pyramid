/**
 * Edge rendering.
 *
 * All edges of a given style are merged into one LineSegments geometry, so the
 * cost is a couple of draw calls rather than one per relationship. Dependency
 * edges are drawn as shallow curves — parallel straight lines between clusters
 * collapse into an unreadable mesh, curves stay separable.
 *
 * When a node is selected its outgoing and incoming edges are coloured
 * differently, which is the whole point of the view: direction is the
 * information.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, type LineSegments } from 'three';
import type { GraphEdge } from '@shared/graph';
import type { ScenePalette } from '@/lib/theme';
import { EDGE_STYLE } from './nodeVisuals';
import type { PositionBuffer } from './positionBuffer';

const CURVE_SEGMENTS = 7;
const MAX_SEGMENTS = 26_000;

const DASHED_TYPES = new Set(['test-of', 'implements']);

export interface EdgeLayerProps {
  edges: GraphEdge[];
  buffer: PositionBuffer;
  palette: ScenePalette;
  selectedId: string | null;
  hoveredId: string | null;
  highlighted: Set<string>;
  tracedEdgeIds: Set<string>;
  dimUnrelated: boolean;
  animate: boolean;
  showHierarchy: boolean;
  showExternal: boolean;
}

interface EdgePlan {
  edges: GraphEdge[];
  /** Vertex count per edge (2 for a straight line, more for a curve). */
  segments: number[];
  vertexCount: number;
  positions: Float32Array;
  colors: Float32Array;
}

const EDGE_PRIORITY: Record<string, number> = {
  'module-dependency': 5,
  import: 4,
  'external-dependency': 3,
  'test-of': 3,
  extends: 3,
  implements: 3,
  declares: 2,
  contains: 1,
};

function buildPlan(edges: GraphEdge[]): EdgePlan {
  const segments: number[] = [];
  let vertexCount = 0;
  for (const edge of edges) {
    const curve = EDGE_STYLE[edge.type]?.curve ?? 0;
    const count = curve > 0 ? CURVE_SEGMENTS * 2 : 2;
    segments.push(count);
    vertexCount += count;
  }
  return {
    edges,
    segments,
    vertexCount,
    positions: new Float32Array(vertexCount * 3),
    colors: new Float32Array(vertexCount * 3),
  };
}

export function GraphEdges(props: EdgeLayerProps) {
  const { edges, showHierarchy, showExternal } = props;

  const { solid, dashed } = useMemo(() => {
    const filtered = edges.filter((edge) => {
      if (!showHierarchy && (edge.type === 'contains' || edge.type === 'declares')) return false;
      if (!showExternal && edge.type === 'external-dependency') return false;
      return true;
    });

    // Under pressure, keep the relationships that carry the most meaning.
    const ranked = [...filtered].sort(
      (a, b) => (EDGE_PRIORITY[b.type] ?? 0) - (EDGE_PRIORITY[a.type] ?? 0),
    );

    let budget = MAX_SEGMENTS;
    const kept: GraphEdge[] = [];
    for (const edge of ranked) {
      const cost = (EDGE_STYLE[edge.type]?.curve ?? 0) > 0 ? CURVE_SEGMENTS : 1;
      if (budget - cost < 0) break;
      budget -= cost;
      kept.push(edge);
    }

    return {
      solid: buildPlan(kept.filter((edge) => !DASHED_TYPES.has(edge.type))),
      dashed: buildPlan(kept.filter((edge) => DASHED_TYPES.has(edge.type))),
    };
  }, [edges, showHierarchy, showExternal]);

  return (
    <group>
      <EdgeGroup plan={solid} dashed={false} {...props} />
      <EdgeGroup plan={dashed} dashed {...props} />
    </group>
  );
}

const from: [number, number, number] = [0, 0, 0];
const to: [number, number, number] = [0, 0, 0];
const sourceColor = new Color();
const targetColor = new Color();

function EdgeGroup({
  plan,
  dashed,
  buffer,
  palette,
  selectedId,
  hoveredId,
  highlighted,
  tracedEdgeIds,
  dimUnrelated,
  animate,
}: EdgeLayerProps & { plan: EdgePlan; dashed: boolean }) {
  const lineRef = useRef<LineSegments>(null);
  const dirty = useRef(true);

  const geometry = useMemo(() => {
    const instance = new BufferGeometry();
    const positionAttribute = new BufferAttribute(plan.positions, 3);
    positionAttribute.setUsage(DynamicDrawUsage);
    instance.setAttribute('position', positionAttribute);
    instance.setAttribute('color', new BufferAttribute(plan.colors, 3));
    return instance;
  }, [plan]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  /* Colours: recomputed only when the selection changes. */
  useEffect(() => {
    const anchor = hoveredId ?? selectedId;
    const base = new Color(palette.edge);
    const outgoing = new Color(palette.nodes.function);
    const incoming = new Color(palette.nodes.interface);
    const traced = new Color(palette.accent);
    const background = new Color(palette.background);

    let cursor = 0;
    for (let e = 0; e < plan.edges.length; e += 1) {
      const edge = plan.edges[e];
      const vertices = plan.segments[e];

      // Hierarchy is scaffolding: visible enough to read containment, quiet
      // enough that dependency edges stay the figure rather than the ground.
      let strength = edge.type === 'contains' || edge.type === 'declares' ? 0.2 : 0.62;
      let colorA = base;
      let colorB = base;

      if (tracedEdgeIds.has(edge.id)) {
        colorA = traced;
        colorB = traced;
        strength = 1.25;
      } else if (anchor && edge.source === anchor) {
        colorA = outgoing;
        colorB = outgoing;
        strength = 1.1;
      } else if (anchor && edge.target === anchor) {
        colorA = incoming;
        colorB = incoming;
        strength = 1.1;
      } else if (dimUnrelated && !(highlighted.has(edge.source) && highlighted.has(edge.target))) {
        strength = 0.12;
      }

      sourceColor.copy(colorA).multiplyScalar(strength);
      targetColor.copy(colorB).multiplyScalar(strength);
      if (strength < 0.3) {
        sourceColor.lerp(background, 0.62);
        targetColor.lerp(background, 0.62);
      }

      for (let v = 0; v < vertices; v += 1) {
        // Fade along the edge so direction is readable even at rest.
        const t = v / Math.max(vertices - 1, 1);
        const index = (cursor + v) * 3;
        plan.colors[index] = sourceColor.r + (targetColor.r - sourceColor.r) * t;
        plan.colors[index + 1] = sourceColor.g + (targetColor.g - sourceColor.g) * t;
        plan.colors[index + 2] = sourceColor.b + (targetColor.b - sourceColor.b) * t;
      }
      cursor += vertices;
    }

    const attribute = geometry.getAttribute('color') as BufferAttribute;
    attribute.needsUpdate = true;
  }, [plan, geometry, palette, selectedId, hoveredId, highlighted, tracedEdgeIds, dimUnrelated]);

  useEffect(() => {
    dirty.current = true;
  }, [plan]);

  useFrame(() => {
    if (!buffer.animating && !dirty.current) return;
    dirty.current = false;

    let cursor = 0;
    for (let e = 0; e < plan.edges.length; e += 1) {
      const edge = plan.edges[e];
      const vertices = plan.segments[e];
      const hasSource = buffer.positionOf(edge.source, from);
      const hasTarget = buffer.positionOf(edge.target, to);

      if (!hasSource || !hasTarget) {
        for (let v = 0; v < vertices; v += 1) {
          const index = (cursor + v) * 3;
          plan.positions[index] = 0;
          plan.positions[index + 1] = 0;
          plan.positions[index + 2] = 0;
        }
        cursor += vertices;
        continue;
      }

      const curve = EDGE_STYLE[edge.type]?.curve ?? 0;
      if (curve === 0) {
        writeVertex(plan.positions, cursor, from[0], from[1], from[2]);
        writeVertex(plan.positions, cursor + 1, to[0], to[1], to[2]);
      } else {
        writeCurve(plan.positions, cursor, from, to, curve, vertices);
      }
      cursor += vertices;
    }

    const attribute = geometry.getAttribute('position') as BufferAttribute;
    attribute.needsUpdate = true;
    geometry.computeBoundingSphere();
    if (lineRef.current) lineRef.current.computeLineDistances();
  });

  if (plan.edges.length === 0) return null;

  return (
    <lineSegments ref={lineRef} geometry={geometry} frustumCulled={false} renderOrder={-1}>
      {dashed ? (
        <lineDashedMaterial
          vertexColors
          transparent
          opacity={animate ? 0.9 : 0.9}
          dashSize={1.4}
          gapSize={1.1}
          depthWrite={false}
          toneMapped={false}
        />
      ) : (
        <lineBasicMaterial vertexColors transparent opacity={0.92} depthWrite={false} toneMapped={false} />
      )}
    </lineSegments>
  );
}

function writeVertex(target: Float32Array, index: number, x: number, y: number, z: number): void {
  target[index * 3] = x;
  target[index * 3 + 1] = y;
  target[index * 3 + 2] = z;
}

/**
 * Writes a quadratic curve as a strip of line segments. The control point is
 * offset perpendicular to the connection and lifted slightly, which keeps
 * parallel dependencies from overlapping into a single smear.
 */
function writeCurve(
  target: Float32Array,
  cursor: number,
  a: [number, number, number],
  b: [number, number, number],
  curve: number,
  vertices: number,
): void {
  const midX = (a[0] + b[0]) / 2;
  const midY = (a[1] + b[1]) / 2;
  const midZ = (a[2] + b[2]) / 2;

  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz) || 1;

  // Perpendicular in the XZ plane, plus a vertical bow.
  const offset = length * curve * 0.35;
  const controlX = midX + (-dz / length) * offset;
  const controlY = midY + offset * 0.7;
  const controlZ = midZ + (dx / length) * offset;

  const points = vertices / 2 + 1;
  let previousX = a[0];
  let previousY = a[1];
  let previousZ = a[2];

  for (let i = 1; i < points; i += 1) {
    const t = i / (points - 1);
    const inverse = 1 - t;
    const x = inverse * inverse * a[0] + 2 * inverse * t * controlX + t * t * b[0];
    const y = inverse * inverse * a[1] + 2 * inverse * t * controlY + t * t * b[1];
    const z = inverse * inverse * a[2] + 2 * inverse * t * controlZ + t * t * b[2];

    const segment = cursor + (i - 1) * 2;
    writeVertex(target, segment, previousX, previousY, previousZ);
    writeVertex(target, segment + 1, x, y, z);

    previousX = x;
    previousY = y;
    previousZ = z;
  }
}
