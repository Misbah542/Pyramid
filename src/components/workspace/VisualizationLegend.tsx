/**
 * Legend.
 *
 * Reads from the same table the renderer uses, so it cannot drift out of sync
 * with what is actually on screen.
 */

import { ChevronDown } from 'lucide-react';
import type { NodeType } from '@shared/graph';
import { cn } from '@/lib/cn';
import { useSettingsStore } from '@/store/useSettingsStore';
import { EDGE_STYLE, SHAPE_GEOMETRY, SHAPE_LABEL, SHAPE_FOR_TYPE } from '@/components/scene/nodeVisuals';

const NODE_ROWS: NodeType[] = [
  'repository',
  'module',
  'directory',
  'file',
  'test',
  'config',
  'class',
  'interface',
  'function',
  'external',
];

const EDGE_ROWS = ['contains', 'import', 'module-dependency', 'external-dependency', 'test-of', 'implements'] as const;

export function VisualizationLegend({ className }: { className?: string }) {
  const open = useSettingsStore((state) => state.legendOpen);
  const toggle = useSettingsStore((state) => state.toggle);

  return (
    <div
      className={cn(
        'pointer-events-auto w-56 overflow-hidden rounded-lg border border-line bg-surface/85 shadow-panel backdrop-blur-xl',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => toggle('legendOpen')}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-faint transition-colors hover:text-muted"
      >
        Legend
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-base', !open && '-rotate-90')} />
      </button>

      {open ? (
        <div className="max-h-[52vh] overflow-y-auto border-t border-line px-3 pb-3 pt-2">
          <p className="pb-1.5 text-2xs text-faint">Shape is the node kind, size is how much it holds.</p>
          <ul className="space-y-1">
            {NODE_ROWS.map((type) => (
              <li key={type} className="flex items-center gap-2">
                <span
                  className={cn('h-2.5 w-2.5 shrink-0', SHAPE_CLASS[type])}
                  style={{ backgroundColor: `hsl(var(--n-${type}))` }}
                  aria-hidden
                />
                <span className="flex-1 truncate text-2xs text-muted">{SHAPE_LABEL[SHAPE_FOR_TYPE[type]]}</span>
                <span className="text-2xs text-faint">{SHAPE_GEOMETRY[SHAPE_FOR_TYPE[type]]}</span>
              </li>
            ))}
          </ul>

          <p className="pb-1.5 pt-3 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Relationships</p>
          <ul className="space-y-1">
            {EDGE_ROWS.map((type) => (
              <li key={type} className="flex items-center gap-2" title={EDGE_STYLE[type].description}>
                <span
                  className={cn(
                    'h-px w-5 shrink-0',
                    EDGE_STYLE[type].dashed ? 'border-t border-dashed border-muted' : 'bg-muted',
                  )}
                  aria-hidden
                />
                <span className="flex-1 truncate text-2xs text-muted">{EDGE_STYLE[type].label}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 space-y-1 border-t border-line pt-2">
            <LegendSwatch color="hsl(var(--n-function))" label="Outgoing from selection" />
            <LegendSwatch color="hsl(var(--n-interface))" label="Incoming to selection" />
            <LegendSwatch color="hsl(var(--c-accent))" label="Traced path" />
          </div>

          <p className="mt-2 text-2xs leading-snug text-faint">
            Edges are static relationships found by reading source — not a record of what runs at runtime.
          </p>
        </div>
      ) : null}
    </div>
  );
}

const SHAPE_CLASS: Record<NodeType, string> = {
  repository: 'rounded-full',
  module: 'rounded-[2px]',
  package: 'rounded-[2px]',
  directory: 'rounded-[2px]',
  file: 'rounded-full',
  test: 'rounded-[1px] rotate-45',
  config: 'rounded-[1px]',
  class: 'rotate-45',
  interface: 'rounded-full ring-1 ring-inset ring-base',
  function: 'rounded-full scale-75',
  external: 'rotate-45',
};

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-px w-5 shrink-0" style={{ backgroundColor: color }} aria-hidden />
      <span className="text-2xs text-muted">{label}</span>
    </div>
  );
}
