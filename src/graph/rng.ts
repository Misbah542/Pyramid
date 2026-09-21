/**
 * Deterministic pseudo-randomness.
 *
 * Layouts must be reproducible: the same graph laid out twice has to land in
 * the same place, or the scene would rearrange itself on every refresh. Every
 * "random" offset in a layout comes from a hash of the node id, never Math.random.
 */

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, good enough for jitter. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable value in [-1, 1] derived from an id and a channel name. */
export function stableJitter(id: string, channel: string): number {
  return createRng(hashString(`${id}:${channel}`))() * 2 - 1;
}
