/**
 * The visual language of the graph.
 *
 * Shape encodes what a node *is*, size encodes how much it holds, colour
 * encodes its role. Keeping that mapping in one place is what makes the legend
 * trustworthy: the scene and the legend read from the same table.
 */

import type { GraphNode, NodeType } from '@shared/graph';

export type ShapeKey =
  | 'repository'
  | 'module'
  | 'directory'
  | 'file'
  | 'test'
  | 'config'
  | 'class'
  | 'interface'
  | 'function'
  | 'external';

export const SHAPE_FOR_TYPE: Record<NodeType, ShapeKey> = {
  repository: 'repository',
  module: 'module',
  package: 'module',
  directory: 'directory',
  file: 'file',
  test: 'test',
  config: 'config',
  class: 'class',
  interface: 'interface',
  function: 'function',
  external: 'external',
};

export const SHAPE_LABEL: Record<ShapeKey, string> = {
  repository: 'Repository',
  module: 'Module / package',
  directory: 'Directory',
  file: 'Source file',
  test: 'Test file',
  config: 'Configuration',
  class: 'Class',
  interface: 'Interface',
  function: 'Function',
  external: 'External dependency',
};

export const SHAPE_GEOMETRY: Record<ShapeKey, string> = {
  repository: 'Icosahedron',
  module: 'Rounded block',
  directory: 'Block',
  file: 'Sphere',
  test: 'Tetrahedron',
  config: 'Cube',
  class: 'Octahedron',
  interface: 'Ring',
  function: 'Small sphere',
  external: 'Diamond',
};

/**
 * Node radius in world units.
 *
 * Sizes are calibrated against the layout's minimum sibling spacing (see
 * ConeOptions.minSpacing): a file is comfortably readable at fit distance
 * without neighbours colliding.
 */
export function radiusFor(node: GraphNode): number {
  const files = node.metadata.descendantFileCount ?? 0;
  switch (node.type) {
    case 'repository':
      return 5.5;
    case 'module':
      return 2.6 + Math.log2(files + 2) * 0.5;
    case 'package':
      return 2 + Math.log2(files + 2) * 0.38;
    case 'directory':
      return 1.4 + Math.log2(files + 2) * 0.28;
    case 'file': {
      const lines = node.metadata.lineCount ?? Math.round((node.metadata.byteSize ?? 0) / 38);
      const degree = (node.metadata.incomingDependencyCount ?? 0) + (node.metadata.outgoingDependencyCount ?? 0);
      return Math.min(2.1, 0.82 + Math.log2(lines + 2) * 0.07 + Math.log2(degree + 1) * 0.1);
    }
    case 'test':
    case 'config':
      return 0.78;
    case 'class':
      return 0.6;
    case 'interface':
      return 0.55;
    case 'function':
      return 0.42;
    case 'external':
      return 0.95 + Math.log2((node.metadata.incomingDependencyCount ?? 0) + 2) * 0.17;
    default:
      return 0.8;
  }
}

/** Emissive strength — draws the eye to structurally important nodes. */
export function emissiveFor(node: GraphNode): number {
  if (node.type === 'repository') return 0.55;
  if (node.type === 'module') return 0.3;
  if (node.type === 'external') return 0.22;
  const degree = (node.metadata.incomingDependencyCount ?? 0) + (node.metadata.outgoingDependencyCount ?? 0);
  return Math.min(0.34, 0.06 + degree * 0.012);
}

/** Priority for label budgeting: higher wins a label when space is tight. */
export function labelPriority(node: GraphNode): number {
  const degree = (node.metadata.incomingDependencyCount ?? 0) + (node.metadata.outgoingDependencyCount ?? 0);
  switch (node.type) {
    case 'repository':
      return 1000;
    case 'module':
      return 500 + (node.metadata.descendantFileCount ?? 0);
    case 'package':
      return 300 + (node.metadata.descendantFileCount ?? 0);
    case 'directory':
      return 120 + (node.metadata.descendantFileCount ?? 0) * 0.5;
    case 'external':
      return 90 + degree * 2;
    case 'file':
      return 60 + degree * 3;
    case 'test':
    case 'config':
      return 30 + degree;
    default:
      return 10 + degree;
  }
}

export const EDGE_STYLE: Record<
  string,
  { label: string; dashed: boolean; description: string; curve: number }
> = {
  contains: { label: 'Contains', dashed: false, description: 'Directory holds this file or subdirectory.', curve: 0 },
  import: { label: 'Imports', dashed: false, description: 'File statically imports another file in the repository.', curve: 0.22 },
  'module-dependency': {
    label: 'Module dependency',
    dashed: false,
    description: 'Aggregated file imports between two top-level modules.',
    curve: 0.34,
  },
  'external-dependency': {
    label: 'External package',
    dashed: false,
    description: 'File imports a third-party package.',
    curve: 0.28,
  },
  'test-of': { label: 'Tests', dashed: true, description: 'Test file matched to the source file it appears to cover.', curve: 0.2 },
  extends: { label: 'Extends', dashed: false, description: 'Class extends another class.', curve: 0.16 },
  implements: { label: 'Implements', dashed: true, description: 'Class implements an interface.', curve: 0.16 },
  declares: { label: 'Declares', dashed: false, description: 'File declares this symbol.', curve: 0 },
};
