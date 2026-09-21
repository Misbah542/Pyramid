/**
 * Instanced node rendering.
 *
 * Every node type shares one InstancedMesh per shape, so a few thousand nodes
 * cost a handful of draw calls. Positions are interpolated in place on the
 * typed arrays; React only re-renders when the *set* of visible nodes changes.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { GraphNode } from '@shared/graph';
import type { ScenePalette } from '@/lib/theme';
import { radiusFor, SHAPE_FOR_TYPE, type ShapeKey } from './nodeVisuals';
import type { PositionBuffer } from './positionBuffer';

const SHAPE_ORDER: ShapeKey[] = [
  'repository',
  'module',
  'directory',
  'file',
  'test',
  'config',
  'class',
  'interface',
  'function',
  'external',
];

/** Extra scaling applied per shape so different geometries read at similar weight. */
const SHAPE_SCALE: Record<ShapeKey, [number, number, number]> = {
  repository: [1, 1, 1],
  module: [1.25, 0.85, 1.25],
  directory: [1.15, 0.8, 1.15],
  file: [1, 1, 1],
  test: [1.15, 1.15, 1.15],
  config: [0.85, 0.85, 0.85],
  class: [1, 1, 1],
  interface: [1, 1, 1],
  function: [1, 1, 1],
  external: [1, 0.72, 1],
};

export interface GraphNodesProps {
  nodes: GraphNode[];
  buffer: PositionBuffer;
  palette: ScenePalette;
  highlighted: Set<string>;
  selectedId: string | null;
  pinnedIds: string[];
  hoveredId: string | null;
  /** True when a selection is active and unrelated nodes should recede. */
  dimUnrelated: boolean;
  animate: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string, additive: boolean) => void;
  onActivate: (id: string) => void;
}

interface ShapeBucket {
  key: ShapeKey;
  nodes: GraphNode[];
  radii: Float32Array;
}

const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const quaternion = new Quaternion();
const color = new Color();
const dimColor = new Color();

export function GraphNodes({
  nodes,
  buffer,
  palette,
  highlighted,
  selectedId,
  pinnedIds,
  hoveredId,
  dimUnrelated,
  animate,
  onHover,
  onSelect,
  onActivate,
}: GraphNodesProps) {
  const meshes = useRef(new Map<ShapeKey, InstancedMesh>());
  const dirty = useRef(true);
  const coloured = useRef(new Set<ShapeKey>());

  const buckets = useMemo<ShapeBucket[]>(() => {
    const grouped = new Map<ShapeKey, GraphNode[]>();
    for (const node of nodes) {
      const key = SHAPE_FOR_TYPE[node.type];
      const bucket = grouped.get(key);
      if (bucket) bucket.push(node);
      else grouped.set(key, [node]);
    }
    return SHAPE_ORDER.filter((key) => grouped.has(key)).map((key) => {
      const bucketNodes = grouped.get(key)!;
      const radii = new Float32Array(bucketNodes.length);
      bucketNodes.forEach((node, index) => {
        radii[index] = radiusFor(node);
      });
      return { key, nodes: bucketNodes, radii };
    });
  }, [nodes]);

  // Colour is a function of selection state, not of time — recompute only when
  // the highlight set changes.
  useEffect(() => {
    dimColor.set(palette.background);
    const anchor = hoveredId ?? selectedId;
    const pinned = new Set(pinnedIds);

    for (const bucket of buckets) {
      const mesh = meshes.current.get(bucket.key);
      if (!mesh) continue;
      for (let i = 0; i < bucket.nodes.length; i += 1) {
        const node = bucket.nodes[i];
        color.set(palette.nodes[node.type]);
        const isAnchor = node.id === anchor;
        const isRelated = highlighted.has(node.id) || pinned.has(node.id);

        if (isAnchor) {
          color.lerp(new Color('#ffffff'), 0.45);
        } else if (dimUnrelated && !isRelated) {
          color.lerp(dimColor, 0.78);
        } else if (isRelated) {
          color.multiplyScalar(1.12);
        }
        mesh.setColorAt(i, color);
      }
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
        // The first setColorAt creates the attribute; the material has to be
        // recompiled with USE_INSTANCING_COLOR or the colours are ignored.
        if (!coloured.current.has(bucket.key)) {
          coloured.current.add(bucket.key);
          (mesh.material as Material).needsUpdate = true;
        }
      }
    }
  }, [buckets, highlighted, selectedId, hoveredId, pinnedIds, dimUnrelated, palette]);

  useEffect(() => {
    dirty.current = true;
  }, [buckets]);

  useFrame((_, delta) => {
    const moved = buffer.step(Math.min(delta, 0.05), animate);
    if (!moved && !dirty.current) return;
    dirty.current = false;

    for (const bucket of buckets) {
      const mesh = meshes.current.get(bucket.key);
      if (!mesh) continue;
      const shapeScale = SHAPE_SCALE[bucket.key];

      for (let i = 0; i < bucket.nodes.length; i += 1) {
        const node = bucket.nodes[i];
        const index = buffer.indexById.get(node.id);
        if (index === undefined) {
          scale.set(0, 0, 0);
          matrix.compose(position.set(0, 0, 0), quaternion, scale);
          mesh.setMatrixAt(i, matrix);
          continue;
        }
        const base = index * 3;
        position.set(buffer.current[base], buffer.current[base + 1], buffer.current[base + 2]);
        const appear = buffer.appear[index];
        // Ease-out-back on entrance gives the reveal a little life without
        // becoming a bouncing toy.
        const eased = appear >= 1 ? 1 : 1 - Math.pow(1 - appear, 3);
        const radius = bucket.radii[i] * eased;
        scale.set(radius * shapeScale[0], radius * shapeScale[1], radius * shapeScale[2]);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  });

  const handlePointerOver = (bucket: ShapeBucket) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const node = bucket.nodes[event.instanceId ?? -1];
    if (node) onHover(node.id);
  };

  const handlePointerOut = () => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(null);
  };

  const handleClick = (bucket: ShapeBucket) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const node = bucket.nodes[event.instanceId ?? -1];
    if (node) onSelect(node.id, event.shiftKey || event.metaKey);
  };

  const handleDoubleClick = (bucket: ShapeBucket) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const node = bucket.nodes[event.instanceId ?? -1];
    if (node) onActivate(node.id);
  };

  return (
    <group>
      {buckets.map((bucket) => (
        <instancedMesh
          key={bucket.key}
          ref={(instance) => {
            if (instance) {
              meshes.current.set(bucket.key, instance);
              instance.instanceMatrix.setUsage(DynamicDrawUsage);
              dirty.current = true;
            } else {
              meshes.current.delete(bucket.key);
              coloured.current.delete(bucket.key);
            }
          }}
          args={[undefined as unknown as BufferGeometry, undefined, bucket.nodes.length]}
          frustumCulled
          onPointerOver={handlePointerOver(bucket)}
          onPointerOut={handlePointerOut()}
          onClick={handleClick(bucket)}
          onDoubleClick={handleDoubleClick(bucket)}
        >
          <ShapeGeometry shape={bucket.key} />
          <meshStandardMaterial
            roughness={bucket.key === 'external' ? 0.5 : 0.34}
            metalness={0.12}
            envMapIntensity={0.6}
            transparent
            opacity={bucket.key === 'directory' || bucket.key === 'module' ? 0.92 : 1}
          />
        </instancedMesh>
      ))}
    </group>
  );
}

function ShapeGeometry({ shape }: { shape: ShapeKey }) {
  switch (shape) {
    case 'repository':
      return <icosahedronGeometry args={[1, 1]} />;
    case 'module':
      return <boxGeometry args={[1.5, 1.5, 1.5]} />;
    case 'directory':
      return <boxGeometry args={[1.4, 1.4, 1.4]} />;
    case 'test':
      return <tetrahedronGeometry args={[1.2, 0]} />;
    case 'config':
      return <boxGeometry args={[1.3, 1.3, 1.3]} />;
    case 'class':
      return <octahedronGeometry args={[1.1, 0]} />;
    case 'interface':
      return <torusGeometry args={[0.8, 0.3, 6, 12]} />;
    case 'function':
      return <sphereGeometry args={[1, 8, 6]} />;
    case 'external':
      return <octahedronGeometry args={[1.15, 0]} />;
    case 'file':
    default:
      return <sphereGeometry args={[1, 14, 10]} />;
  }
}
