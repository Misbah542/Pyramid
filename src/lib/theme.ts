/**
 * Bridges the CSS design tokens into WebGL.
 *
 * Three.js needs concrete colours, not CSS variables, so this reads the tokens
 * once per theme change and exposes them as colour strings. One palette, two
 * renderers.
 */

import type { NodeType } from '@shared/graph';

export type ThemeName = 'dark' | 'light';

export interface ScenePalette {
  background: string;
  fog: string;
  grid: string;
  edge: string;
  ink: string;
  accent: string;
  nodes: Record<NodeType, string>;
}

const NODE_TOKEN: Record<NodeType, string> = {
  repository: '--n-repository',
  directory: '--n-directory',
  module: '--n-module',
  package: '--n-package',
  file: '--n-file',
  test: '--n-test',
  config: '--n-config',
  class: '--n-class',
  interface: '--n-interface',
  function: '--n-function',
  external: '--n-external',
};

const FALLBACK: ScenePalette = {
  background: '#07070b',
  fog: '#07070b',
  grid: '#232634',
  edge: '#6a7086',
  ink: '#e7e9ee',
  accent: '#5b8cff',
  nodes: {
    repository: '#f2b75e',
    directory: '#5b8cff',
    module: '#3d9bff',
    package: '#9d7dff',
    file: '#8d94a8',
    test: '#3ecf8e',
    config: '#e0a33e',
    class: '#c77dff',
    interface: '#5ecdf5',
    function: '#ffb86b',
    external: '#ff7a93',
  },
};

function readToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const raw = styles.getPropertyValue(name).trim();
  if (!raw) return fallback;
  // Tokens are stored as `H S% L%` triplets so Tailwind can append an alpha
  // channel. Three.js only parses the comma-separated form, so convert here —
  // without this every node silently renders white.
  const parts = raw.split(/\s+/);
  if (parts.length < 3) return fallback;
  return `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

let cache: { theme: ThemeName; palette: ScenePalette } | null = null;

export function readScenePalette(theme: ThemeName): ScenePalette {
  if (cache && cache.theme === theme) return cache.palette;
  if (typeof window === 'undefined') return FALLBACK;

  const styles = getComputedStyle(document.documentElement);
  const nodes = {} as Record<NodeType, string>;
  for (const [type, token] of Object.entries(NODE_TOKEN) as Array<[NodeType, string]>) {
    nodes[type] = readToken(styles, token, FALLBACK.nodes[type]);
  }

  const palette: ScenePalette = {
    background: readToken(styles, '--scene-bg', FALLBACK.background),
    fog: readToken(styles, '--scene-fog', FALLBACK.fog),
    grid: readToken(styles, '--scene-grid', FALLBACK.grid),
    edge: readToken(styles, '--scene-edge', FALLBACK.edge),
    ink: readToken(styles, '--c-ink', FALLBACK.ink),
    accent: readToken(styles, '--c-accent', FALLBACK.accent),
    nodes,
  };

  cache = { theme, palette };
  return palette;
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme);
  cache = null;
}
