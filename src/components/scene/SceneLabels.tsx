/**
 * Labels.
 *
 * Two problems solved here. First, a label per node would put thousands of DOM
 * elements over the canvas, so only a budget of the highest-priority nodes gets
 * one — always including whatever is selected or hovered. Second, in a dense
 * cluster those labels would still pile on top of each other, so each frame the
 * chosen labels are projected to screen space and any that collide with a
 * higher-priority label are hidden. The result reads like a map rather than a
 * word cloud.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Group, Vector3 } from 'three';
import type { GraphNode } from '@shared/graph';
import { labelPriority } from './nodeVisuals';
import type { PositionBuffer } from './positionBuffer';

export interface SceneLabelsProps {
  nodes: GraphNode[];
  buffer: PositionBuffer;
  budget: number;
  selectedId: string | null;
  hoveredId: string | null;
  pinnedIds: string[];
}

interface LabelEntry {
  node: GraphNode;
  priority: number;
  /** Rough on-screen half-width in pixels, from the label's character count. */
  halfWidth: number;
  halfHeight: number;
}

const MAX_DISTANCE = 900;

export function SceneLabels({ nodes, buffer, budget, selectedId, hoveredId, pinnedIds }: SceneLabelsProps) {
  const groups = useRef(new Map<string, Group>());
  const elements = useRef(new Map<string, HTMLElement>());
  const { camera, size } = useThree();

  const labelled = useMemo<LabelEntry[]>(() => {
    const always = new Set([selectedId, hoveredId, ...pinnedIds].filter(Boolean) as string[]);
    const ranked = [...nodes].sort((a, b) => labelPriority(b) - labelPriority(a));
    const chosen: GraphNode[] = [];
    const seen = new Set<string>();

    for (const node of nodes) {
      if (always.has(node.id) && !seen.has(node.id)) {
        chosen.push(node);
        seen.add(node.id);
      }
    }
    for (const node of ranked) {
      if (chosen.length >= budget) break;
      if (seen.has(node.id)) continue;
      chosen.push(node);
      seen.add(node.id);
    }

    return chosen.map((node) => {
      const isRoot = node.type === 'repository';
      const isContainer = node.type === 'module' || node.type === 'package' || node.type === 'directory';
      const fontSize = isRoot ? 13 : isContainer ? 11 : 10;
      return {
        node,
        // Pinned/selected labels always win a collision.
        priority: always.has(node.id) ? Number.MAX_SAFE_INTEGER : labelPriority(node),
        halfWidth: (node.name.length * fontSize * 0.58) / 2 + 6,
        halfHeight: fontSize * 0.8,
      };
    });
  }, [nodes, budget, selectedId, hoveredId, pinnedIds]);

  const ordered = useMemo(() => [...labelled].sort((a, b) => b.priority - a.priority), [labelled]);

  useEffect(() => {
    const ids = new Set(labelled.map((entry) => entry.node.id));
    for (const id of [...groups.current.keys()]) if (!ids.has(id)) groups.current.delete(id);
    for (const id of [...elements.current.keys()]) if (!ids.has(id)) elements.current.delete(id);
  }, [labelled]);

  const scratch: [number, number, number] = [0, 0, 0];
  const projected = useRef(new Vector3());
  const placed = useRef<Array<{ x: number; y: number; halfWidth: number; halfHeight: number }>>([]);

  useFrame(() => {
    placed.current.length = 0;

    for (const entry of ordered) {
      const id = entry.node.id;
      const group = groups.current.get(id);
      const element = elements.current.get(id);
      if (!group) continue;

      if (!buffer.positionOf(id, scratch)) {
        if (element) element.style.visibility = 'hidden';
        continue;
      }

      group.position.set(scratch[0], scratch[1], scratch[2]);
      if (!element) continue;

      projected.current.set(scratch[0], scratch[1], scratch[2]);
      const distance = camera.position.distanceTo(projected.current);
      projected.current.project(camera);

      const behind = projected.current.z > 1;
      if (behind || distance > MAX_DISTANCE) {
        element.style.visibility = 'hidden';
        continue;
      }

      const x = ((projected.current.x + 1) / 2) * size.width;
      const y = ((1 - projected.current.y) / 2) * size.height;

      let collides = false;
      for (const box of placed.current) {
        if (
          Math.abs(box.x - x) < box.halfWidth + entry.halfWidth &&
          Math.abs(box.y - y) < box.halfHeight + entry.halfHeight
        ) {
          collides = true;
          break;
        }
      }

      if (collides) {
        element.style.visibility = 'hidden';
        continue;
      }

      placed.current.push({ x, y, halfWidth: entry.halfWidth, halfHeight: entry.halfHeight });
      element.style.visibility = 'visible';
      // Fade distant labels rather than cutting them off abruptly.
      element.style.opacity = distance > MAX_DISTANCE * 0.7 ? '0.45' : '1';
    }
  });

  return (
    <group>
      {labelled.map(({ node }) => (
        <group
          key={node.id}
          ref={(instance) => {
            if (instance) groups.current.set(node.id, instance);
            else groups.current.delete(node.id);
          }}
        >
          <Html center zIndexRange={[12, 0]} style={{ pointerEvents: 'none', userSelect: 'none' }}>
            <NodeLabel
              node={node}
              emphasised={node.id === selectedId || node.id === hoveredId}
              elementRef={(element) => {
                if (element) elements.current.set(node.id, element);
                else elements.current.delete(node.id);
              }}
            />
          </Html>
        </group>
      ))}
    </group>
  );
}

function NodeLabel({
  node,
  emphasised,
  elementRef,
}: {
  node: GraphNode;
  emphasised: boolean;
  elementRef: (element: HTMLElement | null) => void;
}) {
  const isContainer = node.type === 'module' || node.type === 'package' || node.type === 'directory';
  const isRoot = node.type === 'repository';

  return (
    <span
      ref={elementRef}
      className={[
        'whitespace-nowrap rounded-xs px-1.5 py-0.5 font-mono leading-none backdrop-blur-sm transition-colors',
        isRoot ? 'text-[0.8125rem] font-semibold tracking-tight' : isContainer ? 'text-[0.6875rem]' : 'text-[0.625rem]',
        emphasised
          ? 'bg-accent/20 text-ink ring-1 ring-accent/50'
          : isRoot || isContainer
            ? 'bg-base/70 text-ink/90'
            : 'bg-base/55 text-muted',
      ].join(' ')}
      style={{ transform: `translateY(${isRoot ? -22 : isContainer ? -16 : -12}px)`, visibility: 'hidden' }}
    >
      {node.name}
    </span>
  );
}
