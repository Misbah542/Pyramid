/**
 * Status bar: camera actions on the left, graph state on the right.
 */

import { AlertTriangle, Frame, Loader2, Maximize2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCount, formatDuration } from '@/lib/format';
import { LAYOUT_META } from '@/graph/layouts';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { Kbd } from '@/components/ui/Primitives';
import { CompactLayoutSwitcher } from './WorkspaceTopBar';

export function WorkspaceBottomBar({ performanceWarning }: { performanceWarning: boolean }) {
  const graph = useWorkspaceStore((state) => state.graph);
  const visibleNodeIds = useWorkspaceStore((state) => state.visibleNodeIds);
  const visibleEdges = useWorkspaceStore((state) => state.visibleEdges);
  const layoutMode = useWorkspaceStore((state) => state.layoutMode);
  const layoutPending = useWorkspaceStore((state) => state.layoutPending);
  const fitView = useWorkspaceStore((state) => state.fitView);
  const resetCamera = useWorkspaceStore((state) => state.resetCamera);
  const isolatedId = useWorkspaceStore((state) => state.filters.isolatedId);

  if (!graph) return null;

  const status =
    graph.analysisStatus === 'complete'
      ? { label: 'Complete', tone: 'text-positive' }
      : graph.analysisStatus === 'partial'
        ? { label: 'Partial', tone: 'text-warning' }
        : { label: 'Failed', tone: 'text-danger' };

  return (
    <footer
      className="z-chrome flex shrink-0 items-center gap-3 border-t border-line bg-surface/90 px-3 text-2xs text-faint backdrop-blur-xl"
      style={{ height: 'var(--bottombar-h)' }}
    >
      <div className="flex items-center gap-1">
        <BarButton onClick={fitView} icon={<Maximize2 className="h-3 w-3" />} label="Fit graph" shortcut="F" />
        <BarButton onClick={resetCamera} icon={<RotateCcw className="h-3 w-3" />} label="Reset camera" shortcut="R" />
      </div>

      <div className="hidden h-3.5 w-px bg-line sm:block" />

      <div className="hidden items-center gap-1.5 sm:flex">
        <Frame className="h-3 w-3" />
        <span className="font-mono">{LAYOUT_META[layoutMode].label}</span>
      </div>

      <div className="sm:hidden">
        <CompactLayoutSwitcher />
      </div>

      {layoutPending ? (
        <span className="flex items-center gap-1.5 text-muted">
          <Loader2 className="h-3 w-3 animate-spin" />
          Computing layout…
        </span>
      ) : null}

      {isolatedId ? <span className="text-accent">Isolated view</span> : null}

      {performanceWarning ? (
        <span className="flex items-center gap-1.5 text-warning" role="status">
          <AlertTriangle className="h-3 w-3" />
          <span className="hidden md:inline">
            Frame rate is low — try reducing depth, hiding edges, or switching render quality to Fast.
          </span>
          <span className="md:hidden">Low frame rate</span>
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-3 font-mono">
        <span title="Nodes currently rendered of the total in the graph">
          {formatCount(visibleNodeIds.size)}
          <span className="text-faint/70">/{formatCount(graph.nodes.length)}</span> nodes
        </span>
        <span className="hidden sm:inline" title="Edges currently rendered of the total in the graph">
          {formatCount(visibleEdges.length)}
          <span className="text-faint/70">/{formatCount(graph.edges.length)}</span> edges
        </span>
        {graph.metadata.durationMs > 0 ? (
          <span className="hidden lg:inline" title="Server-side analysis duration">
            {formatDuration(graph.metadata.durationMs)}
          </span>
        ) : null}
        <span className={cn('font-sans', status.tone)} title="Analysis status">
          {status.label}
        </span>
      </div>
    </footer>
  );
}

function BarButton({
  onClick,
  icon,
  label,
  shortcut,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-6 items-center gap-1.5 rounded-sm px-1.5 text-2xs text-muted transition-colors hover:bg-elevated/70 hover:text-ink"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {shortcut ? <Kbd className="hidden h-4 md:inline-flex">{shortcut}</Kbd> : null}
    </button>
  );
}
