/**
 * Command palette (⌘K / Ctrl-K).
 *
 * Searches files, folders, modules, symbols and external packages, then flies
 * the camera to whatever is chosen and opens its inspector.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Command, CornerDownLeft, Search } from 'lucide-react';
import type { NodeType } from '@shared/graph';
import { cn } from '@/lib/cn';
import { truncatePath } from '@/lib/format';
import { searchNodes, splitHighlight, type SearchMatch } from '@/graph/search';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { Kbd } from '@/components/ui/Primitives';
import { SHAPE_LABEL, SHAPE_FOR_TYPE } from '@/components/scene/nodeVisuals';

const FILTER_TABS: Array<{ id: string; label: string; types: NodeType[] | null }> = [
  { id: 'all', label: 'All', types: null },
  { id: 'files', label: 'Files', types: ['file', 'test', 'config'] },
  { id: 'modules', label: 'Modules', types: ['module', 'package', 'directory'] },
  { id: 'symbols', label: 'Symbols', types: ['class', 'interface', 'function'] },
  { id: 'packages', label: 'Packages', types: ['external'] },
];

export function SearchCommandPalette() {
  const open = useWorkspaceStore((state) => state.paletteOpen);
  const setOpen = useWorkspaceStore((state) => state.setPaletteOpen);
  const graph = useWorkspaceStore((state) => state.graph);
  const focusNode = useWorkspaceStore((state) => state.focusNode);
  const hover = useWorkspaceStore((state) => state.hover);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setTab('all');
    }
  }, [open]);

  const results = useMemo<SearchMatch[]>(() => {
    if (!graph || !query.trim()) return [];
    const types = FILTER_TABS.find((entry) => entry.id === tab)?.types;
    return searchNodes(graph.nodes, query, {
      limit: 50,
      types: types ? new Set(types) : undefined,
      includeSymbols: tab === 'all' || tab === 'symbols',
    });
  }, [graph, query, tab]);

  useEffect(() => setActive(0), [query, tab]);

  useEffect(() => {
    const item = listRef.current?.children[active] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const commit = (match: SearchMatch | undefined) => {
    if (!match) return;
    focusNode(match.node.id);
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-palette flex items-start justify-center bg-base/70 px-4 pt-[12vh] backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Search the repository"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-overlay/95 shadow-pop animate-scale-in">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((current) => Math.max(current - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                commit(results[active]);
              } else if (event.key === 'Tab') {
                event.preventDefault();
                const currentIndex = FILTER_TABS.findIndex((entry) => entry.id === tab);
                const nextIndex = (currentIndex + (event.shiftKey ? -1 : 1) + FILTER_TABS.length) % FILTER_TABS.length;
                setTab(FILTER_TABS[nextIndex].id);
              }
            }}
            placeholder="Search files, modules, classes, functions, packages…"
            aria-label="Search query"
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
          <Kbd>esc</Kbd>
        </div>

        <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
          {FILTER_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                'rounded-sm px-2 py-1 text-2xs font-medium transition-colors',
                tab === entry.id ? 'bg-accent/15 text-accent' : 'text-faint hover:text-muted',
              )}
            >
              {entry.label}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1 text-2xs text-faint">
            <Kbd>tab</Kbd> switch
          </span>
        </div>

        <div className="max-h-[46vh] min-h-[8rem] overflow-y-auto">
          {!query.trim() ? (
            <div className="px-4 py-8 text-center">
              <Command className="mx-auto h-5 w-5 text-faint" />
              <p className="pt-2 text-xs text-muted">Search the whole repository graph</p>
              <p className="pt-1 text-2xs text-faint">
                Try a file name, a folder, a class or a package. Results fly the camera to the node.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-muted">No matches for “{query}”</p>
              <p className="pt-1 text-2xs text-faint">
                Only analysed nodes are searchable — files skipped by analysis limits will not appear.
              </p>
            </div>
          ) : (
            <ul ref={listRef} role="listbox" aria-label="Search results">
              {results.map((match, position) => (
                <li
                  key={`${match.node.id}-${match.field}`}
                  role="option"
                  aria-selected={position === active}
                  onMouseEnter={() => {
                    setActive(position);
                    hover(match.node.id);
                  }}
                  onMouseLeave={() => hover(null)}
                  onClick={() => commit(match)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 px-4 py-2 transition-colors',
                    position === active ? 'bg-accent/10' : 'hover:bg-elevated/50',
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: `hsl(var(--n-${match.node.type}))` }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-ink">
                      {match.field === 'name'
                        ? splitHighlight(match.node.name, match.nameRanges).map((part, index) => (
                            <span key={index} className={part.match ? 'text-accent' : undefined}>
                              {part.text}
                            </span>
                          ))
                        : match.node.name}
                    </span>
                    <span className="block truncate font-mono text-2xs text-faint">
                      {match.symbolName ? `declares ${match.symbolName} · ` : ''}
                      {truncatePath(match.node.path || match.node.name, 58)}
                    </span>
                  </span>
                  <span className="shrink-0 text-2xs text-faint">{SHAPE_LABEL[SHAPE_FOR_TYPE[match.node.type]]}</span>
                  {position === active ? <CornerDownLeft className="h-3 w-3 shrink-0 text-faint" /> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
