/**
 * Layers and filters.
 *
 * Controls what the scene contains (node categories, depth) rather than how it
 * looks — the look lives in the view settings popover.
 */

import { useMemo } from 'react';
import { Layers } from 'lucide-react';
import type { NodeType } from '@shared/graph';
import { languageLabel } from '@shared/language';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { Switch } from '@/components/ui/Primitives';
import { SHAPE_LABEL, SHAPE_FOR_TYPE } from '@/components/scene/nodeVisuals';

const CATEGORY_ROWS: NodeType[] = ['module', 'directory', 'file', 'test', 'config', 'class', 'external'];

export function LayersPanel() {
  const graph = useWorkspaceStore((state) => state.graph);
  const filters = useWorkspaceStore((state) => state.filters);
  const setFilters = useWorkspaceStore((state) => state.setFilters);
  const toggleNodeType = useWorkspaceStore((state) => state.toggleNodeType);
  const visibleNodeIds = useWorkspaceStore((state) => state.visibleNodeIds);

  const counts = useMemo(() => {
    const totals = new Map<NodeType, number>();
    for (const node of graph?.nodes ?? []) {
      totals.set(node.type, (totals.get(node.type) ?? 0) + 1);
    }
    // Packages read as modules in the UI.
    totals.set('module', (totals.get('module') ?? 0) + (totals.get('package') ?? 0));
    totals.set('class', (totals.get('class') ?? 0) + (totals.get('interface') ?? 0) + (totals.get('function') ?? 0));
    return totals;
  }, [graph]);

  const maxDepth = useMemo(() => {
    let deepest = 1;
    for (const node of graph?.nodes ?? []) {
      if (node.type === 'external') continue;
      deepest = Math.max(deepest, node.metadata.depth);
    }
    return Math.min(deepest, 12);
  }, [graph]);

  const languages = graph?.metadata.languageStats ?? [];

  if (!graph) return null;

  return (
    <div className="space-y-4 px-3 pb-4 pt-3">
      <section>
        <header className="flex items-center justify-between pb-1.5">
          <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Node layers</h3>
          <span className="font-mono text-2xs text-faint">{formatCount(visibleNodeIds.size)} shown</span>
        </header>
        <ul className="space-y-0.5">
          {CATEGORY_ROWS.map((type) => {
            const enabled = filters.nodeTypes.has(type);
            const total = counts.get(type) ?? 0;
            return (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => {
                    toggleNodeType(type);
                    if (type === 'module') toggleNodeType('package');
                    if (type === 'class') {
                      toggleNodeType('interface');
                      toggleNodeType('function');
                    }
                  }}
                  disabled={total === 0}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left transition-colors duration-fast',
                    enabled ? 'text-ink hover:bg-elevated/60' : 'text-faint hover:bg-elevated/40',
                    total === 0 && 'pointer-events-none opacity-40',
                  )}
                  aria-pressed={enabled}
                >
                  <span
                    className={cn('h-2.5 w-2.5 shrink-0 rounded-[2px] transition-opacity', !enabled && 'opacity-25')}
                    style={{ backgroundColor: `hsl(var(--n-${type}))` }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-xs">{SHAPE_LABEL[SHAPE_FOR_TYPE[type]]}</span>
                  <span className="font-mono text-2xs text-faint">{formatCount(total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-1 border-t border-line pt-3">
        <h3 className="pb-1 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Filters</h3>
        <Switch
          label="Test files"
          description="Files matching a test naming or directory convention."
          checked={filters.showTests}
          onChange={(next) => setFilters({ showTests: next })}
        />
        <Switch
          label="Configuration files"
          description="Manifests, lockfiles and build configuration."
          checked={filters.showConfig}
          onChange={(next) => setFilters({ showConfig: next })}
        />
        <Switch
          label="External packages"
          description="Third-party packages referenced by an import."
          checked={filters.showExternal}
          onChange={(next) => setFilters({ showExternal: next })}
        />
      </section>

      <section className="border-t border-line pt-3">
        <div className="flex items-center justify-between pb-1.5">
          <label htmlFor="depth-range" className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">
            Hierarchy depth
          </label>
          <span className="font-mono text-2xs text-muted">
            {filters.maxDepth >= maxDepth ? 'All' : `≤ ${filters.maxDepth}`}
          </span>
        </div>
        <input
          id="depth-range"
          type="range"
          min={1}
          max={maxDepth}
          value={Math.min(filters.maxDepth, maxDepth)}
          onChange={(event) => setFilters({ maxDepth: Number(event.target.value) })}
          className="w-full accent-[hsl(var(--c-accent))]"
        />
        <p className="pt-1 text-2xs leading-snug text-faint">
          Lower depth keeps large repositories readable by collapsing to module level.
        </p>
      </section>

      {languages.length > 1 ? (
        <section className="border-t border-line pt-3">
          <h3 className="pb-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Languages</h3>
          <div className="flex flex-wrap gap-1">
            {languages.slice(0, 10).map((stat) => {
              const active = !filters.languages || filters.languages.has(stat.language);
              return (
                <button
                  key={stat.language}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    const next = new Set(filters.languages ?? languages.map((entry) => entry.language));
                    if (next.has(stat.language)) next.delete(stat.language);
                    else next.add(stat.language);
                    setFilters({ languages: next.size === languages.length ? null : next });
                  }}
                  className={cn(
                    'rounded-sm border px-1.5 py-0.5 text-2xs transition-colors duration-fast',
                    active ? 'border-line-strong bg-elevated text-ink' : 'border-line text-faint hover:text-muted',
                  )}
                >
                  {languageLabel(stat.language)}
                  <span className="ml-1 font-mono text-faint">{formatCount(stat.files)}</span>
                </button>
              );
            })}
          </div>
          {filters.languages ? (
            <button
              type="button"
              onClick={() => setFilters({ languages: null })}
              className="mt-1.5 text-2xs text-accent hover:underline"
            >
              Reset language filter
            </button>
          ) : null}
        </section>
      ) : null}

      {filters.isolatedId ? (
        <section className="rounded-md border border-accent/30 bg-accent/[0.06] p-2.5">
          <div className="flex items-center gap-1.5 text-2xs font-medium text-accent">
            <Layers className="h-3.5 w-3.5" />
            Isolating one module
          </div>
          <p className="mt-1 text-2xs leading-snug text-muted">
            Only this subtree and the nodes it is connected to are shown.
          </p>
          <button
            type="button"
            onClick={() => setFilters({ isolatedId: null })}
            className="mt-1.5 text-2xs text-accent hover:underline"
          >
            Show the whole repository
          </button>
        </section>
      ) : null}
    </div>
  );
}
