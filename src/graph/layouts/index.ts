import { architectureLayout } from './architecture';
import { flowLayout } from './flow';
import { focusLayout } from './focus';
import { galaxyLayout } from './galaxy';
import { treeLayout } from './tree';
import { extentOf, toResult, type Vec3 } from './hierarchy';
import type { LayoutRequest, LayoutResult } from './types';

export * from './types';

const LAYOUTS: Record<LayoutRequest['mode'], (request: LayoutRequest) => Map<string, Vec3>> = {
  architecture: architectureLayout,
  galaxy: galaxyLayout,
  tree: treeLayout,
  focus: focusLayout,
  flow: flowLayout,
};

/**
 * Runs one layout. Pure and deterministic: identical input always produces
 * identical output, which is what stops the scene reshuffling between renders.
 */
export function computeLayout(request: LayoutRequest): LayoutResult {
  const positions = LAYOUTS[request.mode](request);
  const ids = request.nodes.map((node) => node.id);
  return {
    ids,
    positions: toResult(ids, positions),
    mode: request.mode,
    extent: extentOf(positions),
  };
}
