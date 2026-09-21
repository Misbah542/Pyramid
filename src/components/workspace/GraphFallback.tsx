/**
 * Non-WebGL fallback.
 *
 * When WebGL is unavailable the architecture is still worth showing, so this
 * renders the same graph as a module map: every top-level module with its size,
 * languages and the modules it depends on. Selection and the inspector keep
 * working exactly as they do in the 3D scene.
 */

import { useMemo } from 'react';
import { MonitorX } from 'lucide-react';
import { languageLabel } from '@shared/language';
import { getModules, degreeOf } from '@shared/graph-utils';
import { cn } from '@/lib/cn';
import { formatBytes, formatCount } from '@/lib/format';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

export function GraphFallback({ reason }: { reason: 'unsupported' | 'error' }) {
  const graph = useWorkspaceStore((state) => state.graph);
  const index = useWorkspaceStore((state) => state.index);
  const selectedId = useWorkspaceStore((state) => state.selectedId);
  const select = useWorkspaceStore((state) => state.select);

  const modules = useMemo(() => (index ? getModules(index) : []), [index]);

  const dependenciesOf = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!graph || !index) return map;
    for (const edge of graph.edges) {
      if (edge.type !== 'module-dependency') continue;
      const bucket = map.get(edge.source) ?? [];
      const target = index.nodes.get(edge.target);
      if (target) bucket.push(target.name);
      map.set(edge.source, bucket);
    }
    return map;
  }, [graph, index]);

  if (!graph || !index) return null;

  return (
    <div className="h-full overflow-y-auto bg-base bg-spatial px-4 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-warning/25 bg-warning/[0.05] p-4">
          <MonitorX className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <h2 className="text-sm font-medium text-ink">
              {reason === 'unsupported' ? '3D visualization is unavailable' : 'The 3D scene could not start'}
            </h2>
            <p className="pt-1 text-xs leading-relaxed text-muted">
              {reason === 'unsupported'
                ? 'This browser or device does not expose WebGL, which RepoVerse needs for the spatial view.'
                : 'The WebGL context failed to initialise. This usually means the GPU is unavailable to the browser.'}{' '}
              The analysis is complete either way — below is the same graph as a module map, and the explorer, search and
              inspector all work normally.
            </p>
          </div>
        </div>

        <h3 className="pb-2 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">
          {formatCount(modules.length)} top-level modules
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {modules.map((module) => {
            const languages = Object.entries(module.metadata.languageMix ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3);
            const dependencies = dependenciesOf.get(module.id) ?? [];
            return (
              <button
                key={module.id}
                type="button"
                onClick={() => select(module.id)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  selectedId === module.id
                    ? 'border-accent/50 bg-accent/[0.07]'
                    : 'border-line bg-surface/60 hover:border-line-strong',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-mono text-sm text-ink">{module.name}</span>
                  <span className="shrink-0 font-mono text-2xs text-faint">
                    {formatCount(module.metadata.descendantFileCount)} files
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 pt-2">
                  {languages.map(([language, count]) => (
                    <span key={language} className="chip">
                      {languageLabel(language)} <span className="font-mono text-faint">{count}</span>
                    </span>
                  ))}
                  <span className="chip">{formatBytes(module.metadata.descendantByteSize)}</span>
                </div>
                <p className="pt-2 text-2xs leading-snug text-faint">
                  {dependencies.length
                    ? `Depends on ${dependencies.slice(0, 4).join(', ')}${dependencies.length > 4 ? ` +${dependencies.length - 4}` : ''}`
                    : 'No outgoing module dependencies detected'}
                  {' · '}
                  {formatCount(degreeOf(module))} connections
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
