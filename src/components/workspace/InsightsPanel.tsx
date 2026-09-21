/**
 * Repository insights.
 *
 * Each card states what it measured and how, and renders an explicit
 * "not available" state when the analysis did not produce the input it needs.
 */

import { useMemo } from 'react';
import { ChevronRight, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { computeInsights, type Insight } from '@/graph/insights';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Primitives';

export function InsightsPanel({ onClose, className }: { onClose?: () => void; className?: string } = {}) {
  const graph = useWorkspaceStore((state) => state.graph);
  const index = useWorkspaceStore((state) => state.index);
  const togglePanel = useWorkspaceStore((state) => state.togglePanel);
  const close = onClose ?? (() => togglePanel('insights'));

  const sections = useMemo(() => (graph && index ? computeInsights(graph, index) : []), [graph, index]);

  if (!graph || !index) return null;

  return (
    <aside
      className={cn(
        'pointer-events-auto flex h-full w-[22rem] max-w-[86vw] flex-col border-l border-line bg-surface/95 shadow-panel backdrop-blur-xl',
        className,
      )}
    >
      <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <div>
          <h2 className="text-xs font-semibold text-ink">Repository insights</h2>
          <p className="text-2xs text-faint">Measured from this analysis — nothing is estimated.</p>
        </div>
        <IconButton label="Close insights" onClick={close}>
          <X className="h-4 w-4" />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {graph.warnings.length > 0 ? (
          <section className="rounded-md border border-warning/25 bg-warning/[0.06] p-2.5">
            <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-warning">
              <Info className="h-3 w-3" />
              Analysis notes
            </h3>
            <ul className="mt-1.5 space-y-1.5">
              {graph.warnings.map((warning, position) => (
                <li key={`${warning.code}-${position}`}>
                  <p className="text-2xs leading-snug text-ink">{warning.message}</p>
                  {warning.detail ? <p className="text-2xs leading-snug text-faint">{warning.detail}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {sections.map((section) => (
          <section key={section.id}>
            <h3 className="pb-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">{section.title}</h3>
            <div className="space-y-1.5">
              {section.insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const focusNode = useWorkspaceStore((state) => state.focusNode);
  const hover = useWorkspaceStore((state) => state.hover);
  const unavailable = insight.value === null;

  return (
    <article
      className={cn(
        'rounded-md border px-2.5 py-2 transition-colors',
        unavailable ? 'border-dashed border-line bg-transparent' : 'border-line bg-elevated/40',
        insight.tone === 'notable' && !unavailable && 'border-warning/30 bg-warning/[0.05]',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-2xs font-medium text-muted">{insight.label}</h4>
        {unavailable ? (
          <Badge>Not available</Badge>
        ) : (
          <button
            type="button"
            disabled={!insight.nodeId}
            onClick={() => insight.nodeId && focusNode(insight.nodeId)}
            onMouseEnter={() => insight.nodeId && hover(insight.nodeId)}
            onMouseLeave={() => hover(null)}
            className={cn(
              'truncate font-mono text-xs text-ink',
              insight.nodeId && 'transition-colors hover:text-accent',
            )}
          >
            {insight.value}
          </button>
        )}
      </div>

      <p className="pt-1 text-2xs leading-snug text-faint">{insight.meaning}</p>

      {insight.items && insight.items.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 border-t border-line pt-1.5">
          {insight.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={!item.nodeId}
                onClick={() => item.nodeId && focusNode(item.nodeId)}
                onMouseEnter={() => item.nodeId && hover(item.nodeId)}
                onMouseLeave={() => hover(null)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-xs px-1 py-0.5 text-left transition-colors',
                  item.nodeId ? 'hover:bg-elevated/70' : 'cursor-default',
                )}
              >
                {item.nodeId ? <ChevronRight className="h-2.5 w-2.5 shrink-0 text-faint" /> : null}
                <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted">{item.label}</span>
                <span className="shrink-0 font-mono text-[0.625rem] text-faint">{item.value}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
