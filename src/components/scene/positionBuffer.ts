/**
 * Animated position storage for the scene.
 *
 * Positions live outside React: re-rendering thousands of nodes through the
 * reconciler every frame would be far too slow, so layouts write into these
 * typed arrays and the renderer interpolates them in place.
 */

export class PositionBuffer {
  ids: string[] = [];
  indexById = new Map<string, number>();
  current: Float32Array = new Float32Array(0);
  target: Float32Array = new Float32Array(0);
  /** Per-node 0→1 entrance progress, used for the staggered reveal. */
  appear: Float32Array = new Float32Array(0);
  animating = false;

  /**
   * Points the buffer at a new layout. Nodes that already existed keep their
   * current position and glide to the new one; new nodes start at their target
   * and scale in, so a layout change never looks like a teleport.
   */
  setTarget(ids: string[], positions: Float32Array, immediate: boolean): void {
    const previousIndex = this.indexById;
    const previousCurrent = this.current;
    const previousAppear = this.appear;

    const count = ids.length;
    const current: Float32Array = new Float32Array(count * 3);
    const appear: Float32Array = new Float32Array(count);
    const indexById = new Map<string, number>();

    for (let i = 0; i < count; i += 1) {
      const id = ids[i];
      indexById.set(id, i);
      const previous = previousIndex.get(id);
      if (previous !== undefined && !immediate) {
        current[i * 3] = previousCurrent[previous * 3];
        current[i * 3 + 1] = previousCurrent[previous * 3 + 1];
        current[i * 3 + 2] = previousCurrent[previous * 3 + 2];
        appear[i] = previousAppear[previous];
      } else {
        current[i * 3] = positions[i * 3];
        current[i * 3 + 1] = positions[i * 3 + 1];
        current[i * 3 + 2] = positions[i * 3 + 2];
        appear[i] = immediate ? 1 : 0;
      }
    }

    this.ids = ids;
    this.indexById = indexById;
    this.current = current;
    this.target = positions;
    this.appear = appear;
    this.animating = !immediate;
  }

  /** Advances the interpolation. Returns true when anything moved. */
  step(delta: number, enabled: boolean): boolean {
    const count = this.ids.length;
    if (count === 0) return false;

    if (!enabled) {
      if (!this.animating) return false;
      this.current.set(this.target);
      this.appear.fill(1);
      this.animating = false;
      return true;
    }

    if (!this.animating) return false;

    // Critically-damped-ish ease; framerate independent.
    const lerp = 1 - Math.exp(-delta * 6.5);
    let moved = false;

    for (let i = 0; i < count; i += 1) {
      const base = i * 3;
      const dx = this.target[base] - this.current[base];
      const dy = this.target[base + 1] - this.current[base + 1];
      const dz = this.target[base + 2] - this.current[base + 2];

      if (dx * dx + dy * dy + dz * dz > 0.0004) {
        this.current[base] += dx * lerp;
        this.current[base + 1] += dy * lerp;
        this.current[base + 2] += dz * lerp;
        moved = true;
      } else {
        this.current[base] = this.target[base];
        this.current[base + 1] = this.target[base + 1];
        this.current[base + 2] = this.target[base + 2];
      }

      if (this.appear[i] < 1) {
        // Stagger by index so the graph assembles rather than popping in.
        const stagger = Math.min(0.55, (i / Math.max(count, 1)) * 0.55);
        this.appear[i] = Math.min(1, this.appear[i] + delta * (1.8 - stagger));
        moved = true;
      }
    }

    this.animating = moved;
    return true;
  }

  positionOf(id: string, out: [number, number, number]): boolean {
    const index = this.indexById.get(id);
    if (index === undefined) return false;
    out[0] = this.current[index * 3];
    out[1] = this.current[index * 3 + 1];
    out[2] = this.current[index * 3 + 2];
    return true;
  }

  /** Centre of mass of the current positions — what "fit" should look at. */
  centroid(out: [number, number, number]): void {
    const count = this.ids.length;
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    if (count === 0) return;
    for (let i = 0; i < count; i += 1) {
      out[0] += this.current[i * 3];
      out[1] += this.current[i * 3 + 1];
      out[2] += this.current[i * 3 + 2];
    }
    out[0] /= count;
    out[1] /= count;
    out[2] /= count;
  }

  /**
   * Radius used for fitting the camera.
   *
   * The 95th percentile rather than the true maximum: a single distant
   * external package should not shrink the whole repository to a dot.
   */
  extent(percentile = 0.95): number {
    const count = this.ids.length;
    if (count === 0) return 1;

    const centre: [number, number, number] = [0, 0, 0];
    this.centroid(centre);

    const distances = new Float64Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = i * 3;
      distances[i] = Math.hypot(
        this.current[base] - centre[0],
        this.current[base + 1] - centre[1],
        this.current[base + 2] - centre[2],
      );
    }
    distances.sort();
    const index = Math.min(count - 1, Math.floor(count * percentile));
    return Math.max(distances[index], 1);
  }
}
