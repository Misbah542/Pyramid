/**
 * Hover tooltip.
 *
 * Follows the pointer as a DOM overlay rather than living in the 3D scene, so
 * the text stays crisp and readable over the canvas at any zoom level.
 */

import { useEffect, useState } from 'react';
import type { GraphNode } from '@shared/graph';
import { languageLabel } from '@shared/language';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { formatCount, truncatePath } from '@/lib/format';
import { SHAPE_LABEL, SHAPE_FOR_TYPE } from '@/components/scene/nodeVisuals';

export function SceneTooltip() {
  const hoveredId = useWorkspaceStore((state) => state.hoveredId);
  const index = useWorkspaceStore((state) => state.index);
  const node = hoveredId ? (index?.nodes.get(hoveredId) ?? null) : null;

  const [point, setPoint] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!node) return;
    const onMove = (event: PointerEvent) => setPoint({ x: event.clientX, y: event.clientY });
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [node]);

  if (!node) return null;

  const flipX = point.x > window.innerWidth - 300;
  const flipY = point.y > window.innerHeight - 220;

  return (
    <div
      className="pointer-events-none fixed z-overlay max-w-[18rem] animate-fade-in rounded-md border border-line bg-overlay/95 p-2.5 shadow-pop backdrop-blur-xl"
      style={{
        left: flipX ? point.x - 12 : point.x + 16,
        top: flipY ? point.y - 12 : point.y + 16,
        transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`,
      }}
      role="tooltip"
    >
      <TooltipBody node={node} />
    </div>
  );
}

function TooltipBody({ node }: { node: GraphNode }) {
  const parentModule = node.moduleId?.replace(/^dir:/, '') ?? null;
  const rows: Array<[string, string]> = [];

  rows.push(['Type', SHAPE_LABEL[SHAPE_FOR_TYPE[node.type]]]);
  if (node.type === 'external') {
    rows.push(['Ecosystem', node.metadata.ecosystem ?? 'unknown']);
    rows.push(['Imported by', formatCount(node.metadata.incomingDependencyCount)]);
  } else {
    if (parentModule && parentModule !== node.path) rows.push(['Module', parentModule]);
    if (node.language) rows.push(['Language', languageLabel(node.language)]);
    if (node.metadata.lineCount !== undefined) rows.push(['Lines', formatCount(node.metadata.lineCount)]);
    if (node.metadata.descendantFileCount) rows.push(['Files', formatCount(node.metadata.descendantFileCount)]);
    rows.push(['Imports', formatCount(node.metadata.outgoingDependencyCount)]);
    rows.push(['Imported by', formatCount(node.metadata.incomingDependencyCount)]);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1.5">
        <span
          className="mt-1 h-2 w-2 shrink-0 rounded-[2px]"
          style={{ backgroundColor: `hsl(var(--n-${node.type}))` }}
          aria-hidden
        />
        <span className="break-all font-mono text-xs font-medium leading-snug text-ink">{node.name}</span>
      </div>
      {node.path && node.path !== node.name ? (
        <p className="break-all font-mono text-2xs leading-snug text-faint">{truncatePath(node.path, 52)}</p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pt-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-2xs text-faint">{label}</dt>
            <dd className="text-right font-mono text-2xs text-muted">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line pt-1.5 text-2xs text-faint">Click to inspect · Double-click to focus</p>
    </div>
  );
}
