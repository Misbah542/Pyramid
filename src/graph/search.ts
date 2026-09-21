/**
 * Fuzzy search over the graph, backing the ⌘K command palette and the explorer
 * filter. Scores favour name matches over path matches and exact prefixes over
 * scattered subsequences, so typing `ProfileVM` finds `ProfileViewModel.kt`.
 */

import type { GraphNode, NodeType } from '@shared/graph';

export interface SearchMatch {
  node: GraphNode;
  score: number;
  /** Character indices of the match inside the displayed label. */
  nameRanges: number[];
  field: 'name' | 'path' | 'symbol';
  /** Set when the hit came from a symbol declared in the file. */
  symbolName?: string;
}

const TYPE_BONUS: Partial<Record<NodeType, number>> = {
  repository: 40,
  module: 24,
  package: 16,
  directory: 10,
  file: 8,
  class: 6,
  interface: 6,
  function: 2,
  test: 0,
  config: 0,
  external: 4,
};

/**
 * Subsequence match with positional scoring.
 * Returns null when `query` is not a subsequence of `text`.
 */
export function fuzzyScore(text: string, query: string): { score: number; ranges: number[] } | null {
  if (!query) return { score: 0, ranges: [] };
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  const exact = haystack.indexOf(needle);
  if (exact !== -1) {
    const ranges = Array.from({ length: needle.length }, (_, offset) => exact + offset);
    // Contiguous matches are worth far more than scattered ones.
    let score = 120 - exact * 2 + needle.length * 4;
    if (exact === 0) score += 40;
    else if (/[^a-zA-Z0-9]/.test(text[exact - 1])) score += 24;
    return { score, ranges };
  }

  const ranges: number[] = [];
  let cursor = 0;
  let score = 0;
  let streak = 0;

  for (let i = 0; i < needle.length; i += 1) {
    const character = needle[i];
    let found = -1;
    for (let j = cursor; j < haystack.length; j += 1) {
      if (haystack[j] === character) {
        found = j;
        break;
      }
    }
    if (found === -1) return null;

    if (found === cursor && i > 0) {
      streak += 1;
      score += 6 + streak * 2;
    } else {
      streak = 0;
      score += 2;
      const previous = text[found - 1];
      // Reward matches at word boundaries and camelCase humps.
      if (found === 0 || (previous && /[^a-zA-Z0-9]/.test(previous))) score += 10;
      else if (previous && previous === previous.toLowerCase() && text[found] === text[found].toUpperCase()) score += 8;
    }
    ranges.push(found);
    cursor = found + 1;
  }

  score -= Math.max(0, text.length - needle.length) * 0.08;
  return { score, ranges };
}

export interface SearchOptions {
  limit?: number;
  types?: ReadonlySet<NodeType>;
  /** Include symbols declared inside files, matched by symbol name. */
  includeSymbols?: boolean;
}

export function searchNodes(nodes: GraphNode[], query: string, options: SearchOptions = {}): SearchMatch[] {
  const { limit = 40, types, includeSymbols = true } = options;
  const trimmed = query.trim();
  if (!trimmed) return [];

  const matches: SearchMatch[] = [];

  for (const node of nodes) {
    if (types && !types.has(node.type)) continue;

    const nameMatch = fuzzyScore(node.name, trimmed);
    const typeBonus = TYPE_BONUS[node.type] ?? 0;

    if (nameMatch) {
      matches.push({
        node,
        score: nameMatch.score + typeBonus + depthBonus(node),
        nameRanges: nameMatch.ranges,
        field: 'name',
      });
      continue;
    }

    const pathMatch = node.path ? fuzzyScore(node.path, trimmed) : null;
    if (pathMatch) {
      matches.push({
        node,
        score: pathMatch.score * 0.6 + typeBonus + depthBonus(node),
        nameRanges: [],
        field: 'path',
      });
      continue;
    }

    if (includeSymbols && node.metadata.symbols?.length) {
      for (const symbol of node.metadata.symbols) {
        const symbolMatch = fuzzyScore(symbol.name, trimmed);
        if (!symbolMatch) continue;
        matches.push({
          node,
          score: symbolMatch.score * 0.85 + typeBonus,
          nameRanges: [],
          field: 'symbol',
          symbolName: symbol.name,
        });
        break;
      }
    }
  }

  matches.sort((a, b) => b.score - a.score || a.node.path.length - b.node.path.length);
  return matches.slice(0, limit);
}

function depthBonus(node: GraphNode): number {
  return Math.max(0, 8 - node.metadata.depth * 1.5);
}

/** Splits a label into matched / unmatched runs for rendering. */
export function splitHighlight(text: string, ranges: number[]): Array<{ text: string; match: boolean }> {
  if (ranges.length === 0) return [{ text, match: false }];
  const set = new Set(ranges);
  const parts: Array<{ text: string; match: boolean }> = [];
  let buffer = '';
  let bufferMatch = set.has(0);

  for (let i = 0; i < text.length; i += 1) {
    const isMatch = set.has(i);
    if (isMatch !== bufferMatch) {
      if (buffer) parts.push({ text: buffer, match: bufferMatch });
      buffer = '';
      bufferMatch = isMatch;
    }
    buffer += text[i];
  }
  if (buffer) parts.push({ text: buffer, match: bufferMatch });
  return parts;
}
