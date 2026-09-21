/**
 * The visualization workspace.
 *
 * Desktop-first three-column shell around the 3D scene. On small screens the
 * side panels become a bottom sheet so the canvas keeps the space it needs.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronUp, FolderTree, Layers, Lightbulb, Loader2, PanelRight } from 'lucide-react';
import { parseFullName } from '@shared/repo-url';
import { cn } from '@/lib/cn';
import { detectWebGL } from '@/lib/webgl';
import { createDemoGraph } from '@/demo/demo-graph';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useWorkspaceShortcuts } from '@/hooks/useWorkspaceShortcuts';
import { GraphScene } from '@/components/scene/GraphScene';
import { GraphFallback } from '@/components/workspace/GraphFallback';
import { InsightsPanel } from '@/components/workspace/InsightsPanel';
import { LayersPanel } from '@/components/workspace/LayersPanel';
import { NodeInspector } from '@/components/workspace/NodeInspector';
import { RepositoryExplorer } from '@/components/workspace/RepositoryExplorer';
import { SceneTooltip } from '@/components/workspace/SceneTooltip';
import { SearchCommandPalette } from '@/components/workspace/SearchCommandPalette';
import { VisualizationLegend } from '@/components/workspace/VisualizationLegend';
import { WorkspaceBottomBar } from '@/components/workspace/WorkspaceBottomBar';
import { WorkspaceTopBar } from '@/components/workspace/WorkspaceTopBar';
import { IconButton } from '@/components/ui/Button';

type MobileTab = 'explorer' | 'inspector' | 'layers' | 'insights';

export default function WorkspacePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const graph = useWorkspaceStore((state) => state.graph);
  const loadGraph = useWorkspaceStore((state) => state.loadGraph);
  const explorerOpen = useWorkspaceStore((state) => state.explorerOpen);
  const inspectorOpen = useWorkspaceStore((state) => state.inspectorOpen);
  const insightsOpen = useWorkspaceStore((state) => state.insightsOpen);
  const layoutPending = useWorkspaceStore((state) => state.layoutPending);
  const selectedId = useWorkspaceStore((state) => state.selectedId);

  const isMobile = useIsMobile();
  const webgl = useMemo(() => detectWebGL(), []);
  const [performanceWarning, setPerformanceWarning] = useState(false);
  const [sheetTab, setSheetTab] = useState<MobileTab | null>(null);

  useWorkspaceShortcuts();

  const repoParam = params.get('repo');
  const isDemo = params.get('demo') === '1';

  /* Resolve what should be on screen: demo, an already-loaded graph, or a
   * redirect back to the analysis flow. */
  useEffect(() => {
    if (graph) {
      const matchesRoute = isDemo ? graph.repository.isDemo : graph.repository.fullName === repoParam;
      if (matchesRoute) return;
    }

    if (isDemo) {
      loadGraph(createDemoGraph(), 'demo');
      return;
    }

    if (repoParam && parseFullName(repoParam).ok) {
      navigate(`/analyze?repo=${encodeURIComponent(repoParam)}`, { replace: true });
      return;
    }

    navigate('/', { replace: true });
  }, [graph, isDemo, repoParam, loadGraph, navigate]);

  useEffect(() => {
    if (isMobile && selectedId) setSheetTab('inspector');
  }, [selectedId, isMobile]);

  if (!graph) {
    return (
      <div className="flex h-dvh items-center justify-center bg-base text-sm text-faint">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Preparing workspace…
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-base">
      <WorkspaceTopBar />

      <div className="relative flex min-h-0 flex-1">
        {!isMobile && explorerOpen ? (
          <aside className="flex w-[17.5rem] shrink-0 flex-col border-r border-line bg-surface/70 backdrop-blur-xl">
            <SidebarHeading icon={<FolderTree className="h-3.5 w-3.5" />}>Repository explorer</SidebarHeading>
            <RepositoryExplorer />
            <div className="max-h-[46%] shrink-0 overflow-y-auto border-t border-line">
              <SidebarHeading icon={<Layers className="h-3.5 w-3.5" />}>Layers &amp; filters</SidebarHeading>
              <LayersPanel />
            </div>
          </aside>
        ) : null}

        <main className="relative min-w-0 flex-1">
          {webgl.supported ? <GraphScene onPerformanceWarning={setPerformanceWarning} /> : <GraphFallback reason="unsupported" />}

          {webgl.supported ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 flex flex-col justify-end p-3">
                <div className="flex items-end justify-between gap-3">
                  <VisualizationLegend className={cn(isMobile && 'hidden')} />
                  {isMobile ? (
                    <p className="pointer-events-auto max-w-[16rem] rounded-md border border-line bg-surface/85 p-2 text-2xs leading-snug text-faint backdrop-blur">
                      Drag to orbit, pinch to zoom, tap a node to inspect it. For the full workspace — explorer, filters
                      and source preview side by side — open RepoVerse on a larger screen.
                    </p>
                  ) : null}
                </div>
              </div>

              {layoutPending ? (
                <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-line bg-surface/90 px-3 py-1 text-2xs text-muted shadow-panel backdrop-blur">
                  <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" />
                  Laying out {graph.metadata.nodeCount.toLocaleString('en-US')} nodes
                </div>
              ) : null}
            </>
          ) : null}
        </main>

        {!isMobile && inspectorOpen ? (
          <aside className="flex w-[21rem] shrink-0 flex-col border-l border-line bg-surface/70 backdrop-blur-xl">
            <SidebarHeading icon={<PanelRight className="h-3.5 w-3.5" />}>Inspector</SidebarHeading>
            <NodeInspector />
          </aside>
        ) : null}

        {insightsOpen && !isMobile ? (
          <div className="absolute inset-y-0 right-0 z-panel animate-fade-in">
            <InsightsPanel />
          </div>
        ) : null}
      </div>

      <WorkspaceBottomBar performanceWarning={performanceWarning} />

      {isMobile ? <MobileSheet tab={sheetTab} onTab={setSheetTab} /> : null}

      <SceneTooltip />
      <SearchCommandPalette />
    </div>
  );
}

function SidebarHeading({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">
      {icon}
      {children}
    </div>
  );
}

const MOBILE_TABS: Array<{ id: MobileTab; label: string; icon: React.ReactNode }> = [
  { id: 'inspector', label: 'Inspector', icon: <PanelRight className="h-3.5 w-3.5" /> },
  { id: 'explorer', label: 'Files', icon: <FolderTree className="h-3.5 w-3.5" /> },
  { id: 'layers', label: 'Layers', icon: <Layers className="h-3.5 w-3.5" /> },
  { id: 'insights', label: 'Insights', icon: <Lightbulb className="h-3.5 w-3.5" /> },
];

/** Bottom sheet that replaces the side panels on small screens. */
function MobileSheet({ tab, onTab }: { tab: MobileTab | null; onTab: (tab: MobileTab | null) => void }) {
  const open = tab !== null;

  return (
    <>
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-panel flex flex-col rounded-t-xl border-t border-line bg-surface/97 shadow-pop backdrop-blur-xl transition-transform duration-base ease-out',
          open ? 'translate-y-0' : 'translate-y-[calc(100%-3rem)]',
        )}
        style={{ height: '72dvh' }}
        role="dialog"
        aria-label="Workspace panels"
      >
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
          {MOBILE_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onTab(tab === entry.id ? null : entry.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-2xs font-medium transition-colors',
                tab === entry.id ? 'bg-accent/15 text-accent' : 'text-faint',
              )}
              aria-pressed={tab === entry.id}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
          <IconButton label={open ? 'Close panel' : 'Open panel'} onClick={() => onTab(open ? null : 'inspector')}>
            <ChevronUp className={cn('h-4 w-4 transition-transform duration-base', open && 'rotate-180')} />
          </IconButton>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {tab === 'inspector' ? <NodeInspector /> : null}
          {tab === 'explorer' ? <RepositoryExplorer /> : null}
          {tab === 'layers' ? (
            <div className="overflow-y-auto">
              <LayersPanel />
            </div>
          ) : null}
          {tab === 'insights' ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <InsightsPanel onClose={() => onTab(null)} className="w-full max-w-none border-l-0" />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
