/**
 * Inspector for the selected node.
 *
 * Everything shown here is read from the analysed graph. Where a value was not
 * measured (an unread file has no line count, a demo file has no source) the
 * panel says so rather than showing a plausible-looking number.
 */

import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  Crosshair,
  ExternalLink,
  GitBranch,
  MousePointerSquareDashed,
  Route,
  Target,
  X,
} from 'lucide-react';
import type { GraphEdge, GraphNode } from '@shared/graph';
import { languageLabel } from '@shared/language';
import { getDependencyEdges } from '@shared/graph-utils';
import { formatBytes, formatCount, truncatePath } from '@/lib/format';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, StatTile } from '@/components/ui/Primitives';
import { EmptyState } from '@/components/ui/States';
import { SHAPE_LABEL, SHAPE_FOR_TYPE, EDGE_STYLE } from '@/components/scene/nodeVisuals';
import { SourcePreview } from './SourcePreview';

export function NodeInspector() {
  const graph = useWorkspaceStore((state) => state.graph);
  const index = useWorkspaceStore((state) => state.index);
  const selectedId = useWorkspaceStore((state) => state.selectedId);
  const node = selectedId ? (index?.nodes.get(selectedId) ?? null) : null;

  if (!graph || !index) return null;

  if (!node) {
    return (
      <EmptyState
        icon={<MousePointerSquareDashed className="h-4 w-4" />}
        title="No node selected"
        description="Click any node in the scene, the explorer or search to inspect its relationships, metrics and source."
      />
    );
  }

  return <InspectorBody key={node.id} node={node} />;
}

function InspectorBody({ node }: { node: GraphNode }) {
  const graph = useWorkspaceStore((state) => state.graph)!;
  const index = useWorkspaceStore((state) => state.index)!;
  const select = useWorkspaceStore((state) => state.select);
  const focusNode = useWorkspaceStore((state) => state.focusNode);
  const isolate = useWorkspaceStore((state) => state.isolate);
  const isolatedId = useWorkspaceStore((state) => state.filters.isolatedId);
  const traceTo = useWorkspaceStore((state) => state.traceTo);
  const tracedPath = useWorkspaceStore((state) => state.tracedPath);
  const clearTrace = useWorkspaceStore((state) => state.clearTrace);
  const hover = useWorkspaceStore((state) => state.hover);
  const pinnedIds = useWorkspaceStore((state) => state.pinnedIds);

  const [copied, setCopied] = useState(false);

  const { outgoing, incoming } = useMemo(() => getDependencyEdges(index, node.id), [index, node.id]);

  const ancestors = useMemo(() => {
    const chain: GraphNode[] = [];
    let parentId = node.parentId;
    const guard = new Set<string>();
    while (parentId && !guard.has(parentId)) {
      guard.add(parentId);
      const parent = index.nodes.get(parentId);
      if (!parent) break;
      chain.unshift(parent);
      parentId = parent.parentId;
    }
    return chain;
  }, [index, node]);

  const isFile = node.type === 'file' || node.type === 'test' || node.type === 'config';
  const isContainer = node.type === 'directory' || node.type === 'module' || node.type === 'package';
  const gitRef = graph.repository.commit ?? (graph.repository.isDemo ? null : graph.repository.branch);
  const githubUrl =
    graph.repository.url && isFile
      ? `${graph.repository.url}/blob/${graph.repository.commit ?? graph.repository.branch}/${node.path}`
      : graph.repository.url || null;

  const copyPath = () => {
    void navigator.clipboard?.writeText(node.path || node.name);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto">
      {/* Overview ---------------------------------------------------- */}
      <section className="px-3 py-3">
        <div className="flex items-start gap-2">
          <span
            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: `hsl(var(--n-${node.type}))` }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h2 className="break-all font-mono text-sm font-medium leading-snug text-ink">{node.name}</h2>
            <div className="flex flex-wrap items-center gap-1 pt-1.5">
              <Badge>{SHAPE_LABEL[SHAPE_FOR_TYPE[node.type]]}</Badge>
              {node.language ? <Badge>{languageLabel(node.language)}</Badge> : null}
              {node.metadata.isTest ? <Badge tone="positive">Test</Badge> : null}
              {node.type === 'external' ? <Badge tone="warning">{node.metadata.ecosystem ?? 'package'}</Badge> : null}
            </div>
          </div>
        </div>
      </section>

      {/* Location ---------------------------------------------------- */}
      {node.type !== 'external' ? (
        <section className="px-3 py-2.5">
          <SectionTitle>Location</SectionTitle>
          <nav aria-label="Path" className="flex flex-wrap items-center gap-x-1 gap-y-0.5 pt-1">
            {ancestors.map((ancestor) => (
              <span key={ancestor.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => select(ancestor.id)}
                  onMouseEnter={() => hover(ancestor.id)}
                  onMouseLeave={() => hover(null)}
                  className="rounded-xs font-mono text-2xs text-muted transition-colors hover:text-accent"
                >
                  {ancestor.name}
                </button>
                <span className="text-2xs text-faint">/</span>
              </span>
            ))}
            <span className="font-mono text-2xs text-ink">{node.name}</span>
          </nav>
          <div className="flex items-center gap-1 pt-2">
            <Button size="sm" variant="ghost" onClick={copyPath} iconLeft={copied ? <Check className="h-3 w-3 text-positive" /> : <Copy className="h-3 w-3" />}>
              {copied ? 'Copied' : 'Copy path'}
            </Button>
            {githubUrl ? (
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-2xs font-medium text-muted transition-colors hover:bg-elevated/70 hover:text-ink"
              >
                <ExternalLink className="h-3 w-3" />
                Open on GitHub
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Metrics ----------------------------------------------------- */}
      <section className="px-3 py-2.5">
        <SectionTitle>Metrics</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5 pt-1.5">
          {isFile ? (
            <>
              <StatTile
                label="Lines"
                value={node.metadata.lineCount !== undefined ? formatCount(node.metadata.lineCount) : 'Not read'}
                hint={node.metadata.lineCount === undefined ? 'File was not opened during analysis' : undefined}
              />
              <StatTile label="Size" value={formatBytes(node.metadata.byteSize)} />
              <StatTile label="Imports out" value={formatCount(node.metadata.outgoingDependencyCount)} />
              <StatTile label="Imported by" value={formatCount(node.metadata.incomingDependencyCount)} />
            </>
          ) : isContainer ? (
            <>
              <StatTile label="Files" value={formatCount(node.metadata.descendantFileCount)} />
              <StatTile label="Total size" value={formatBytes(node.metadata.descendantByteSize)} />
              <StatTile label="Direct children" value={formatCount(node.metadata.childCount)} />
              <StatTile label="Depth" value={formatCount(node.metadata.depth)} />
            </>
          ) : (
            <>
              <StatTile label="Depends on" value={formatCount(node.metadata.outgoingDependencyCount)} />
              <StatTile label="Used by" value={formatCount(node.metadata.incomingDependencyCount)} />
            </>
          )}
        </div>
        {node.metadata.languageMix && Object.keys(node.metadata.languageMix).length > 1 ? (
          <div className="flex flex-wrap gap-1 pt-2">
            {Object.entries(node.metadata.languageMix)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([language, count]) => (
                <span key={language} className="chip">
                  {languageLabel(language)}
                  <span className="font-mono text-faint">{count}</span>
                </span>
              ))}
          </div>
        ) : null}
      </section>

      {/* Symbols ----------------------------------------------------- */}
      {node.metadata.symbols?.length ? (
        <section className="px-3 py-2.5">
          <SectionTitle>
            Declared symbols
            <span className="font-mono text-faint"> {node.metadata.symbols.length}</span>
          </SectionTitle>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto pt-1.5">
            {node.metadata.symbols.slice(0, 40).map((symbol) => (
              <li key={`${symbol.name}:${symbol.line}`} className="flex items-center gap-2 text-2xs">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: `hsl(var(--n-${symbol.kind}))` }}
                  aria-hidden
                />
                <span className="flex-1 truncate font-mono text-muted">{symbol.name}</span>
                <span className="font-mono text-faint">:{symbol.line}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Relationships ----------------------------------------------- */}
      <section className="px-3 py-2.5">
        <SectionTitle>
          Relationships
          <span className="font-mono text-faint"> {outgoing.length + incoming.length}</span>
        </SectionTitle>

        <RelationshipGroup
          title="Depends on"
          icon={<ArrowUpRight className="h-3 w-3" style={{ color: 'hsl(var(--n-function))' }} />}
          edges={outgoing}
          direction="target"
          emptyLabel="No outgoing dependencies were detected."
        />
        <RelationshipGroup
          title="Depended on by"
          icon={<ArrowDownLeft className="h-3 w-3" style={{ color: 'hsl(var(--n-interface))' }} />}
          edges={incoming}
          direction="source"
          emptyLabel="Nothing in the mapped files imports this."
        />

        {tracedPath ? (
          <div className="mt-2 rounded-md border border-accent/30 bg-accent/[0.06] p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-2xs font-medium text-accent">
                <Route className="h-3 w-3" />
                {tracedPath.length === 0 ? 'Same node' : `Path found · ${tracedPath.length} hops`}
              </span>
              <IconButton label="Clear traced path" size="sm" onClick={clearTrace}>
                <X className="h-3 w-3" />
              </IconButton>
            </div>
            <ol className="mt-1.5 space-y-0.5">
              {tracedPath.map((edge, position) => (
                <li key={edge.id} className="truncate font-mono text-2xs text-muted">
                  {position + 1}. {index.nodes.get(edge.source)?.name} → {index.nodes.get(edge.target)?.name}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {pinnedIds.length > 0 ? (
          <div className="mt-2 rounded-md border border-line bg-elevated/40 p-2">
            <p className="pb-1 text-2xs text-faint">
              {pinnedIds.length} pinned {pinnedIds.length === 1 ? 'node' : 'nodes'} (shift-click to pin)
            </p>
            <div className="flex flex-wrap gap-1">
              {pinnedIds.map((id) => {
                const pinned = index.nodes.get(id);
                if (!pinned) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => traceTo(id)}
                    className="chip transition-colors hover:border-accent/40 hover:text-accent"
                    title={`Trace a dependency path from ${node.name} to ${pinned.name}`}
                  >
                    <Route className="h-2.5 w-2.5" />
                    {pinned.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {/* Source ------------------------------------------------------ */}
      {isFile ? (
        <section className="py-2.5">
          <div className="px-3">
            <SectionTitle>Source</SectionTitle>
          </div>
          <div className="pt-1.5">
            <SourcePreview
              repo={graph.repository.fullName}
              gitRef={gitRef}
              path={node.path}
              language={node.language}
              available={!graph.repository.isDemo}
              githubUrl={githubUrl}
            />
          </div>
        </section>
      ) : null}

      {/* Actions ----------------------------------------------------- */}
      <section className="sticky bottom-0 mt-auto flex flex-wrap gap-1.5 border-t border-line bg-surface/95 px-3 py-2.5 backdrop-blur">
        <Button size="sm" variant="secondary" iconLeft={<Crosshair className="h-3 w-3" />} onClick={() => focusNode(node.id)}>
          Focus in 3D
        </Button>
        {isContainer ? (
          <Button
            size="sm"
            variant={isolatedId === node.id ? 'primary' : 'secondary'}
            iconLeft={<Target className="h-3 w-3" />}
            onClick={() => isolate(isolatedId === node.id ? null : node.id)}
          >
            {isolatedId === node.id ? 'Stop isolating' : 'Isolate'}
          </Button>
        ) : null}
        {node.parentId ? (
          <Button size="sm" variant="ghost" iconLeft={<GitBranch className="h-3 w-3" />} onClick={() => select(node.parentId!)}>
            Parent
          </Button>
        ) : null}
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-faint">{children}</h3>;
}

function RelationshipGroup({
  title,
  icon,
  edges,
  direction,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  edges: GraphEdge[];
  direction: 'source' | 'target';
  emptyLabel: string;
}) {
  const index = useWorkspaceStore((state) => state.index)!;
  const select = useWorkspaceStore((state) => state.select);
  const hover = useWorkspaceStore((state) => state.hover);
  const [expanded, setExpanded] = useState(false);

  const limit = expanded ? edges.length : 6;

  return (
    <div className="pt-2">
      <div className="flex items-center gap-1.5 pb-1">
        {icon}
        <span className="text-2xs font-medium text-muted">{title}</span>
        <span className="font-mono text-2xs text-faint">{edges.length}</span>
      </div>
      {edges.length === 0 ? (
        <p className="text-2xs leading-snug text-faint">{emptyLabel}</p>
      ) : (
        <ul className="space-y-0.5">
          {edges.slice(0, limit).map((edge) => {
            const otherId = direction === 'target' ? edge.target : edge.source;
            const other = index.nodes.get(otherId);
            if (!other) return null;
            const style = EDGE_STYLE[edge.type];
            return (
              <li key={edge.id}>
                <button
                  type="button"
                  onClick={() => select(otherId)}
                  onMouseEnter={() => hover(otherId)}
                  onMouseLeave={() => hover(null)}
                  className="group/rel flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors hover:bg-elevated/60"
                  title={`${style?.label ?? edge.type}: ${other.path || other.name}`}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: `hsl(var(--n-${other.type}))` }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-2xs text-muted group-hover/rel:text-ink">
                      {other.name}
                    </span>
                    {other.path && other.path !== other.name ? (
                      <span className="block truncate font-mono text-[0.625rem] text-faint">
                        {truncatePath(other.path, 40)}
                      </span>
                    ) : null}
                  </span>
                  {edge.metadata?.confidence === 'heuristic' ? (
                    <span
                      className="shrink-0 text-[0.625rem] text-warning"
                      title="Inferred relationship — the resolver matched this by convention, not by an exact path"
                    >
                      ~
                    </span>
                  ) : null}
                  {edge.metadata?.weight && edge.metadata.weight > 1 ? (
                    <span className="shrink-0 font-mono text-[0.625rem] text-faint">×{edge.metadata.weight}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {edges.length > 6 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 px-1.5 text-2xs text-accent hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${edges.length}`}
        </button>
      ) : null}
    </div>
  );
}
