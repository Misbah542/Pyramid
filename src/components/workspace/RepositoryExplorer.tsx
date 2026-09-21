/**
 * Repository explorer.
 *
 * A conventional file tree over the same graph the scene renders — the two
 * stay in sync through the store. Rows are windowed so a repository with
 * thousands of files still scrolls at full speed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Braces,
  ChevronRight,
  FileCode2,
  FileCog,
  FlaskConical,
  Folder,
  FolderOpen,
  Package,
  Search,
  Target,
  X,
} from 'lucide-react';
import type { GraphNode, NodeType } from '@shared/graph';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { fuzzyScore } from '@/graph/search';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { Input } from '@/components/ui/Input';
import { IconButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';

const ROW_HEIGHT = 26;
const OVERSCAN = 8;

interface Row {
  node: GraphNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

export function RepositoryExplorer() {
  const index = useWorkspaceStore((state) => state.index);
  const expandedIds = useWorkspaceStore((state) => state.expandedIds);
  const selectedId = useWorkspaceStore((state) => state.selectedId);
  const hoveredId = useWorkspaceStore((state) => state.hoveredId);
  const visibleNodeIds = useWorkspaceStore((state) => state.visibleNodeIds);
  const toggleExpanded = useWorkspaceStore((state) => state.toggleExpanded);
  const select = useWorkspaceStore((state) => state.select);
  const focusNode = useWorkspaceStore((state) => state.focusNode);
  const hover = useWorkspaceStore((state) => state.hover);
  const isolate = useWorkspaceStore((state) => state.isolate);
  const isolatedId = useWorkspaceStore((state) => state.filters.isolatedId);

  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const scroller = useRef<HTMLDivElement>(null);

  /** Ids that survive the text filter, plus their ancestors. */
  const matched = useMemo(() => {
    if (!index || !query.trim()) return null;
    const keep = new Set<string>();
    for (const node of index.nodes.values()) {
      if (node.type === 'external') continue;
      const score = fuzzyScore(node.name, query) ?? (node.path ? fuzzyScore(node.path, query) : null);
      if (!score) continue;
      keep.add(node.id);
      let parentId = node.parentId;
      while (parentId && !keep.has(parentId)) {
        keep.add(parentId);
        parentId = index.nodes.get(parentId)?.parentId ?? null;
      }
    }
    return keep;
  }, [index, query]);

  const rows = useMemo<Row[]>(() => {
    if (!index?.rootId) return [];
    const out: Row[] = [];

    const walk = (id: string, depth: number) => {
      const node = index.nodes.get(id);
      if (!node) return;
      if (matched && !matched.has(id)) return;

      const childIds = (index.children.get(id) ?? []).filter((childId) => {
        const child = index.nodes.get(childId);
        if (!child) return false;
        if (child.type === 'class' || child.type === 'interface' || child.type === 'function') return false;
        return !matched || matched.has(childId);
      });

      // When searching, branches auto-open so results are reachable.
      const expanded = matched ? true : expandedIds.has(id);
      out.push({ node, depth, hasChildren: childIds.length > 0, expanded });
      if (!expanded) return;
      for (const childId of childIds) walk(childId, depth + 1);
    };

    walk(index.rootId, 0);
    return out;
  }, [index, expandedIds, matched]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    setViewportHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Keep the selected row in view when selection changes elsewhere (scene, palette).
  useEffect(() => {
    if (!selectedId || !scroller.current) return;
    const rowIndex = rows.findIndex((row) => row.node.id === selectedId);
    if (rowIndex === -1) return;
    const top = rowIndex * ROW_HEIGHT;
    const element = scroller.current;
    if (top < element.scrollTop || top > element.scrollTop + element.clientHeight - ROW_HEIGHT) {
      element.scrollTo({ top: Math.max(0, top - element.clientHeight / 2), behavior: 'smooth' });
    }
  }, [selectedId, rows]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const windowed = rows.slice(start, end);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  if (!index) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2.5 pb-2 pt-2">
        <Input
          sizing="sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter files and folders"
          aria-label="Filter the repository tree"
          iconLeft={<Search className="h-3.5 w-3.5" />}
          addon={
            query ? (
              <IconButton label="Clear filter" size="sm" onClick={() => setQuery('')}>
                <X className="h-3 w-3" />
              </IconButton>
            ) : null
          }
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={<Search className="h-4 w-4" />}
          title="No matches"
          description={`Nothing in the tree matches “${query}”.`}
        />
      ) : (
        <div ref={scroller} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div style={{ height: rows.length * ROW_HEIGHT }} className="relative">
            <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }} className="absolute inset-x-0 top-0">
              {windowed.map((row) => (
                <TreeRow
                  key={row.node.id}
                  row={row}
                  selected={row.node.id === selectedId}
                  hovered={row.node.id === hoveredId}
                  isolated={row.node.id === isolatedId}
                  hidden={!visibleNodeIds.has(row.node.id)}
                  onToggle={() => toggleExpanded(row.node.id)}
                  onSelect={(additive) => select(row.node.id, { additive })}
                  onActivate={() => focusNode(row.node.id)}
                  onHover={hover}
                  onIsolate={() => isolate(isolatedId === row.node.id ? null : row.node.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TreeRow({
  row,
  selected,
  hovered,
  isolated,
  hidden,
  onToggle,
  onSelect,
  onActivate,
  onHover,
  onIsolate,
}: {
  row: Row;
  selected: boolean;
  hovered: boolean;
  isolated: boolean;
  hidden: boolean;
  onToggle: () => void;
  onSelect: (additive: boolean) => void;
  onActivate: () => void;
  onHover: (id: string | null) => void;
  onIsolate: () => void;
}) {
  const { node, depth, hasChildren, expanded } = row;
  const container = hasChildren || node.type === 'directory' || node.type === 'module' || node.type === 'package';

  return (
    <div
      className={cn(
        'group/row flex items-center gap-1 pr-1.5 text-xs transition-colors duration-fast',
        selected ? 'bg-accent/12 text-ink' : hovered ? 'bg-elevated/70 text-ink' : 'text-muted hover:bg-elevated/50',
        hidden && 'opacity-45',
      )}
      style={{ height: ROW_HEIGHT, paddingLeft: 6 + depth * 12 }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      {container ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          aria-expanded={expanded}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-faint hover:text-ink"
        >
          <ChevronRight className={cn('h-3 w-3 transition-transform duration-fast', expanded && 'rotate-90')} />
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}

      <button
        type="button"
        onClick={(event) => onSelect(event.shiftKey || event.metaKey)}
        onDoubleClick={onActivate}
        title={node.path || node.name}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <NodeIcon type={node.type} expanded={expanded} />
        <span className={cn('truncate font-mono text-[0.6875rem]', selected && 'font-medium')}>{node.name}</span>
      </button>

      {node.metadata.descendantFileCount ? (
        <span className="shrink-0 font-mono text-[0.625rem] text-faint opacity-0 transition-opacity group-hover/row:opacity-100">
          {formatCount(node.metadata.descendantFileCount)}
        </span>
      ) : null}

      {container ? (
        <IconButton
          label={isolated ? `Stop isolating ${node.name}` : `Isolate ${node.name}`}
          size="sm"
          active={isolated}
          onClick={onIsolate}
          className={cn('shrink-0 opacity-0 group-hover/row:opacity-100', isolated && 'opacity-100')}
        >
          <Target className="h-3 w-3" />
        </IconButton>
      ) : null}
    </div>
  );
}

const ICON_CLASS = 'h-3.5 w-3.5 shrink-0';

function NodeIcon({ type, expanded }: { type: NodeType; expanded: boolean }) {
  const style = { color: `hsl(var(--n-${type}))` };
  switch (type) {
    case 'repository':
      return <Package className={ICON_CLASS} style={style} />;
    case 'module':
    case 'package':
      return <Package className={ICON_CLASS} style={style} />;
    case 'directory':
      return expanded ? (
        <FolderOpen className={ICON_CLASS} style={style} />
      ) : (
        <Folder className={ICON_CLASS} style={style} />
      );
    case 'test':
      return <FlaskConical className={ICON_CLASS} style={style} />;
    case 'config':
      return <FileCog className={ICON_CLASS} style={style} />;
    case 'external':
      return <Braces className={ICON_CLASS} style={style} />;
    default:
      return <FileCode2 className={ICON_CLASS} style={style} />;
  }
}
