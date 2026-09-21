/**
 * Camera behaviour: orbit/pan/zoom plus the scripted moves the UI asks for
 * (focus a node, fit the graph, reset). Transitions are eased rather than cut,
 * except when reduced motion is requested — then they snap.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { PerspectiveCamera, Vector3 } from 'three';
import type { CameraCommand } from '@/store/useWorkspaceStore';
import type { PositionBuffer } from './positionBuffer';

/** A raised three-quarter view: high enough to read the module ring, low enough to keep depth. */
const DEFAULT_DIRECTION = new Vector3(0.48, 0.72, 0.92).normalize();
const WORLD_UP = new Vector3(0, 1, 0);

const right = new Vector3();
const up = new Vector3();
const relative = new Vector3();
const viewDirection = new Vector3();

export interface CameraRigProps {
  command: CameraCommand | null;
  buffer: PositionBuffer;
  animate: boolean;
  /** Radius of the node the camera is focusing, for distance selection. */
  radiusOf: (id: string) => number;
  onInteract?: () => void;
}

export function CameraRig({ command, buffer, animate, radiusOf, onInteract }: CameraRigProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();

  const goalPosition = useRef(new Vector3());
  const goalTarget = useRef(new Vector3());
  const active = useRef(false);
  const lastSeq = useRef(-1);
  const scratch: [number, number, number] = [0, 0, 0];

  /** Distance at which a sphere of `radius` fills a comfortable share of the viewport. */
  const distanceFor = (radius: number, padding = 1.2) => {
    const perspective = camera as PerspectiveCamera;
    const fov = ((perspective.fov ?? 50) * Math.PI) / 180;
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.6);
    const vertical = radius / Math.tan(fov / 2);
    const horizontal = radius / (Math.tan(fov / 2) * aspect);
    return Math.max(vertical, horizontal) * padding;
  };

  /**
   * Exact fit distance for the whole graph.
   *
   * A bounding-sphere fit is far too loose for these layouts — they are wide
   * and shallow, so the sphere is mostly empty air and the graph ends up a dot
   * in the middle of the viewport. Instead every node is projected onto the
   * camera basis and the distance is the smallest one that keeps them all
   * inside the frustum.
   */
  const fitDistance = (target: Vector3, direction: Vector3, padding = 1.06) => {
    const perspective = camera as PerspectiveCamera;
    const fov = ((perspective.fov ?? 50) * Math.PI) / 180;
    const tanHalf = Math.tan(fov / 2);
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.6);

    right.copy(direction).cross(WORLD_UP);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    up.copy(right).cross(direction).normalize();

    const positions = buffer.current;
    const count = buffer.ids.length;
    let distance = 0;

    for (let i = 0; i < count; i += 1) {
      const base = i * 3;
      relative.set(positions[base] - target.x, positions[base + 1] - target.y, positions[base + 2] - target.z);
      const forward = relative.dot(direction);
      const lateral = Math.abs(relative.dot(right));
      const vertical = Math.abs(relative.dot(up));
      distance = Math.max(
        distance,
        vertical / tanHalf + forward,
        lateral / (tanHalf * aspect) + forward,
      );
    }

    return Math.max(distance * padding, 6);
  };

  const applyGoal = (target: Vector3, distance: number) => {
    const direction = new Vector3().subVectors(camera.position, controls.current?.target ?? new Vector3());
    if (direction.lengthSq() < 0.001) direction.copy(DEFAULT_DIRECTION);
    direction.normalize();

    goalTarget.current.copy(target);
    goalPosition.current.copy(target).addScaledVector(direction, distance);
    active.current = true;

    if (!animate) commit();
  };

  const commit = () => {
    camera.position.copy(goalPosition.current);
    if (controls.current) {
      controls.current.target.copy(goalTarget.current);
      controls.current.update();
    }
    active.current = false;
  };

  useEffect(() => {
    if (!command || command.seq === lastSeq.current) return;
    lastSeq.current = command.seq;

    if (command.kind === 'reset') {
      // Reset also restores the default viewing angle, unlike fit.
      buffer.centroid(scratch);
      goalTarget.current.set(scratch[0], scratch[1], scratch[2]);
      goalPosition.current
        .copy(goalTarget.current)
        .addScaledVector(DEFAULT_DIRECTION, fitDistance(goalTarget.current, DEFAULT_DIRECTION));
      active.current = true;
      if (!animate) commit();
      return;
    }

    if (command.kind === 'fit') {
      buffer.centroid(scratch);
      const target = new Vector3(scratch[0], scratch[1], scratch[2]);
      viewDirection.subVectors(camera.position, controls.current?.target ?? target);
      if (viewDirection.lengthSq() < 0.001) viewDirection.copy(DEFAULT_DIRECTION);
      viewDirection.normalize();
      applyGoal(target, fitDistance(target, viewDirection));
      return;
    }

    if (buffer.positionOf(command.nodeId, scratch)) {
      const radius = Math.max(radiusOf(command.nodeId), 0.6);
      applyGoal(new Vector3(scratch[0], scratch[1], scratch[2]), distanceFor(radius * 6.5, 1.35));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.seq]);

  useFrame((_, delta) => {
    if (!active.current) return;
    const lerp = 1 - Math.exp(-Math.min(delta, 0.05) * 4.2);

    camera.position.lerp(goalPosition.current, lerp);
    if (controls.current) {
      controls.current.target.lerp(goalTarget.current, lerp);
      controls.current.update();
    }

    if (
      camera.position.distanceToSquared(goalPosition.current) < 0.02 &&
      (controls.current?.target.distanceToSquared(goalTarget.current) ?? 0) < 0.02
    ) {
      commit();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      rotateSpeed={0.62}
      panSpeed={0.85}
      zoomSpeed={0.9}
      minDistance={3}
      maxDistance={2200}
      // Keep the camera above the floor plane so the scene never turns upside down.
      maxPolarAngle={Math.PI * 0.92}
      onStart={() => {
        active.current = false;
        onInteract?.();
      }}
    />
  );
}
