/**
 * Selection and hover affordance.
 *
 * A billboarded ring around the active node plus a soft pulse, kept as separate
 * meshes so the instanced node buffers never need per-frame colour churn.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Group, type Mesh } from 'three';
import type { ScenePalette } from '@/lib/theme';
import type { PositionBuffer } from './positionBuffer';

export interface SelectionHaloProps {
  buffer: PositionBuffer;
  palette: ScenePalette;
  selectedId: string | null;
  hoveredId: string | null;
  pinnedIds: string[];
  radiusOf: (id: string) => number;
  animate: boolean;
}

const scratch: [number, number, number] = [0, 0, 0];

export function SelectionHalo({
  buffer,
  palette,
  selectedId,
  hoveredId,
  pinnedIds,
  radiusOf,
  animate,
}: SelectionHaloProps) {
  return (
    <group>
      {selectedId ? (
        <Ring
          id={selectedId}
          buffer={buffer}
          color={palette.accent}
          radiusOf={radiusOf}
          animate={animate}
          pulse
        />
      ) : null}
      {hoveredId && hoveredId !== selectedId ? (
        <Ring id={hoveredId} buffer={buffer} color={palette.ink} radiusOf={radiusOf} animate={animate} opacity={0.5} />
      ) : null}
      {pinnedIds
        .filter((id) => id !== selectedId)
        .map((id) => (
          <Ring key={id} id={id} buffer={buffer} color={palette.nodes.test} radiusOf={radiusOf} animate={animate} opacity={0.75} />
        ))}
    </group>
  );
}

function Ring({
  id,
  buffer,
  color,
  radiusOf,
  animate,
  pulse,
  opacity = 0.9,
}: {
  id: string;
  buffer: PositionBuffer;
  color: string;
  radiusOf: (id: string) => number;
  animate: boolean;
  pulse?: boolean;
  opacity?: number;
}) {
  const group = useRef<Group>(null);
  const inner = useRef<Mesh>(null);
  const outer = useRef<Mesh>(null);

  useFrame(({ camera, clock }) => {
    if (!group.current) return;
    if (!buffer.positionOf(id, scratch)) {
      group.current.visible = false;
      return;
    }
    group.current.visible = true;
    group.current.position.set(scratch[0], scratch[1], scratch[2]);
    group.current.quaternion.copy(camera.quaternion);

    const radius = Math.max(radiusOf(id), 0.4);
    if (inner.current) inner.current.scale.setScalar(radius * 1.9);
    if (outer.current && pulse) {
      const phase = animate ? (Math.sin(clock.elapsedTime * 1.9) + 1) / 2 : 0.5;
      outer.current.scale.setScalar(radius * (2.4 + phase * 0.9));
      const material = outer.current.material as { opacity: number };
      material.opacity = 0.16 + (1 - phase) * 0.16;
    }
  });

  return (
    <group ref={group}>
      <mesh ref={inner} renderOrder={2}>
        <ringGeometry args={[0.86, 1, 48]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
      </mesh>
      {pulse ? (
        <mesh ref={outer} renderOrder={1}>
          <ringGeometry args={[0.93, 1, 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.2}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}
