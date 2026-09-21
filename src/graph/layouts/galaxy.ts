/**
 * Dependency Galaxy — a deterministic 3D force layout.
 *
 * Repulsion is approximated with a uniform spatial hash (only the 27 cells
 * around a node are considered), which keeps a few thousand nodes inside a
 * frame budget where a naive O(n²) pass would not. The simulation is seeded
 * from the architecture layout and uses no Math.random, so the same graph
 * always settles into the same shape.
 */

import { architectureLayout } from './architecture';
import { stableJitter } from '../rng';
import type { Vec3 } from './hierarchy';
import type { LayoutRequest } from './types';
import type { EdgeType } from '@shared/graph';

interface Body {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mass: number;
  fixed: boolean;
  external: boolean;
}

export function galaxyLayout(request: LayoutRequest): Map<string, Vec3> {
  const { nodes, edges, rootId, spread } = request;
  const seed = architectureLayout(request);

  const bodies: Body[] = nodes.map((node) => {
    const start = seed.get(node.id) ?? {
      x: stableJitter(node.id, 'x') * 40,
      y: stableJitter(node.id, 'y') * 20,
      z: stableJitter(node.id, 'z') * 40,
    };
    return {
      id: node.id,
      x: start.x,
      y: start.y,
      z: start.z,
      vx: 0,
      vy: 0,
      vz: 0,
      mass: 1 + Math.log2(1 + node.degree) * 0.6 + Math.log2(1 + node.weight) * 0.3,
      fixed: node.id === rootId,
      external: node.type === 'external',
    };
  });

  const indexById = new Map(bodies.map((body, index) => [body.id, index]));
  const links: Array<{ source: number; target: number; type: EdgeType; weight: number }> = [];
  for (const edge of edges) {
    const source = indexById.get(edge.source);
    const target = indexById.get(edge.target);
    if (source === undefined || target === undefined) continue;
    links.push({ source, target, type: edge.type, weight: edge.weight });
  }

  const count = bodies.length;
  const iterations = count > 2500 ? 90 : count > 1200 ? 140 : 220;
  const cellSize = 9 * spread;
  const repulsionStrength = 150 * spread * spread;
  const maxRepulsionDistance = cellSize * 1.5;

  const grid = new Map<number, number[]>();
  const cellKey = (x: number, y: number, z: number) => {
    const cx = Math.floor(x / cellSize) + 512;
    const cy = Math.floor(y / cellSize) + 512;
    const cz = Math.floor(z / cellSize) + 512;
    return (cx * 1024 + cy) * 1024 + cz;
  };

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const alpha = 1 - iteration / iterations;
    const damping = 0.82;

    grid.clear();
    for (let i = 0; i < count; i += 1) {
      const key = cellKey(bodies[i].x, bodies[i].y, bodies[i].z);
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }

    // Short-range repulsion.
    for (let i = 0; i < count; i += 1) {
      const body = bodies[i];
      const baseX = Math.floor(body.x / cellSize) + 512;
      const baseY = Math.floor(body.y / cellSize) + 512;
      const baseZ = Math.floor(body.z / cellSize) + 512;

      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const bucket = grid.get(((baseX + dx) * 1024 + (baseY + dy)) * 1024 + (baseZ + dz));
            if (!bucket) continue;
            for (const j of bucket) {
              if (j <= i) continue;
              const other = bodies[j];
              let ox = body.x - other.x;
              let oy = body.y - other.y;
              let oz = body.z - other.z;
              let distanceSq = ox * ox + oy * oy + oz * oz;
              if (distanceSq > maxRepulsionDistance * maxRepulsionDistance) continue;
              if (distanceSq < 0.01) {
                ox = stableJitter(body.id, 'nudge-x');
                oy = stableJitter(body.id, 'nudge-y');
                oz = stableJitter(body.id, 'nudge-z');
                distanceSq = 0.01;
              }
              const distance = Math.sqrt(distanceSq);
              const force = (repulsionStrength * body.mass * other.mass) / distanceSq / distance;
              const fx = ox * force;
              const fy = oy * force;
              const fz = oz * force;
              body.vx += fx / body.mass;
              body.vy += fy / body.mass;
              body.vz += fz / body.mass;
              other.vx -= fx / other.mass;
              other.vy -= fy / other.mass;
              other.vz -= fz / other.mass;
            }
          }
        }
      }
    }

    // Edge springs. Hierarchy holds tightly; dependencies pull more loosely so
    // clusters form around real coupling rather than folder names.
    for (const link of links) {
      const a = bodies[link.source];
      const b = bodies[link.target];
      const restLength =
        link.type === 'contains' ? 7 * spread : link.type === 'external-dependency' ? 28 * spread : 14 * spread;
      const stiffness =
        link.type === 'contains' ? 0.08 : link.type === 'external-dependency' ? 0.012 : 0.05 * Math.min(link.weight, 4);

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const distance = Math.hypot(dx, dy, dz) || 0.001;
      const displacement = (distance - restLength) * stiffness;
      const fx = (dx / distance) * displacement;
      const fy = (dy / distance) * displacement;
      const fz = (dz / distance) * displacement;

      a.vx += fx / a.mass;
      a.vy += fy / a.mass;
      a.vz += fz / a.mass;
      b.vx -= fx / b.mass;
      b.vy -= fy / b.mass;
      b.vz -= fz / b.mass;
    }

    // Gentle gravity keeps the cloud from drifting apart; externals are pushed
    // outward so third-party surface forms a halo instead of mixing in.
    for (const body of bodies) {
      const pull = body.external ? -0.0022 : 0.0075;
      body.vx -= body.x * pull;
      body.vy -= body.y * pull * 1.9;
      body.vz -= body.z * pull;

      if (body.external) {
        const radial = Math.hypot(body.x, body.z) || 0.001;
        const target = 78 * spread;
        const correction = (target - radial) * 0.004;
        body.vx += (body.x / radial) * correction;
        body.vz += (body.z / radial) * correction;
      }

      if (body.fixed) {
        body.vx = 0;
        body.vy = 0;
        body.vz = 0;
        body.x = 0;
        body.y = 0;
        body.z = 0;
        continue;
      }

      const speedLimit = 12 * alpha + 1;
      const speed = Math.hypot(body.vx, body.vy, body.vz);
      if (speed > speedLimit) {
        const scale = speedLimit / speed;
        body.vx *= scale;
        body.vy *= scale;
        body.vz *= scale;
      }

      body.x += body.vx * alpha;
      body.y += body.vy * alpha;
      body.z += body.vz * alpha;
      body.vx *= damping;
      body.vy *= damping;
      body.vz *= damping;
    }
  }

  const positions = new Map<string, Vec3>();
  for (const body of bodies) positions.set(body.id, { x: body.x, y: body.y, z: body.z });
  return positions;
}
