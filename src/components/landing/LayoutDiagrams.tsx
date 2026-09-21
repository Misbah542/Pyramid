/** Small schematic diagrams of each layout mode, drawn from the same tokens as the scene. */

import type { LayoutMode } from '@/graph/layouts';

const STROKE = 'hsl(var(--scene-edge))';

export function LayoutDiagram({ mode }: { mode: LayoutMode }) {
  switch (mode) {
    case 'architecture':
      return (
        <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden>
          <g stroke={STROKE} strokeWidth="0.7" opacity="0.6">
            {[
              [80, 52, 34, 34],
              [80, 52, 126, 34],
              [80, 52, 40, 76],
              [80, 52, 120, 76],
            ].map(([x1, y1, x2, y2], index) => (
              <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
            <line x1="34" y1="34" x2="24" y2="18" />
            <line x1="34" y1="34" x2="46" y2="16" />
            <line x1="126" y1="34" x2="136" y2="16" />
          </g>
          <circle cx="80" cy="52" r="7" fill="hsl(var(--n-repository))" />
          {[
            [34, 34],
            [126, 34],
            [40, 76],
            [120, 76],
          ].map(([x, y], index) => (
            <rect key={index} x={x - 4} y={y - 4} width="8" height="8" rx="1.5" fill="hsl(var(--n-module))" />
          ))}
          {[
            [24, 18],
            [46, 16],
            [136, 16],
          ].map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="2.6" fill="hsl(var(--n-file))" />
          ))}
        </svg>
      );
    case 'galaxy':
      return (
        <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden>
          <g stroke={STROKE} strokeWidth="0.6" opacity="0.55">
            {[
              [46, 40, 62, 30],
              [46, 40, 40, 58],
              [62, 30, 40, 58],
              [104, 60, 120, 48],
              [104, 60, 114, 74],
              [120, 48, 114, 74],
              [62, 30, 104, 60],
            ].map(([x1, y1, x2, y2], index) => (
              <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
          </g>
          {[
            [46, 40, 4],
            [62, 30, 3],
            [40, 58, 3],
            [104, 60, 4.5],
            [120, 48, 3],
            [114, 74, 2.6],
          ].map(([x, y, r], index) => (
            <circle key={index} cx={x} cy={y} r={r} fill="hsl(var(--n-file))" />
          ))}
          {[
            [22, 20],
            [142, 24],
            [136, 82],
            [20, 80],
          ].map(([x, y], index) => (
            <rect
              key={index}
              x={x - 2.4}
              y={y - 2.4}
              width="4.8"
              height="4.8"
              transform={`rotate(45 ${x} ${y})`}
              fill="hsl(var(--n-external))"
            />
          ))}
        </svg>
      );
    case 'tree':
      return (
        <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden>
          <g stroke={STROKE} strokeWidth="0.7" opacity="0.6">
            <line x1="80" y1="18" x2="44" y2="46" />
            <line x1="80" y1="18" x2="80" y2="46" />
            <line x1="80" y1="18" x2="116" y2="46" />
            <line x1="44" y1="46" x2="30" y2="74" />
            <line x1="44" y1="46" x2="56" y2="74" />
            <line x1="116" y1="46" x2="106" y2="74" />
            <line x1="116" y1="46" x2="130" y2="74" />
          </g>
          <circle cx="80" cy="18" r="6" fill="hsl(var(--n-repository))" />
          {[
            [44, 46],
            [80, 46],
            [116, 46],
          ].map(([x, y], index) => (
            <rect key={index} x={x - 3.6} y={y - 3.6} width="7.2" height="7.2" rx="1.4" fill="hsl(var(--n-directory))" />
          ))}
          {[
            [30, 74],
            [56, 74],
            [106, 74],
            [130, 74],
          ].map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="2.8" fill="hsl(var(--n-file))" />
          ))}
        </svg>
      );
    case 'focus':
      return (
        <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden>
          <circle cx="80" cy="48" r="26" fill="none" stroke="hsl(var(--c-accent))" strokeWidth="0.6" opacity="0.45" />
          <g stroke={STROKE} strokeWidth="0.7" opacity="0.5">
            <line x1="80" y1="48" x2="28" y2="30" />
            <line x1="80" y1="48" x2="28" y2="66" />
            <line x1="80" y1="48" x2="132" y2="32" />
            <line x1="80" y1="48" x2="132" y2="64" />
          </g>
          <rect x="74" y="42" width="12" height="12" rx="2" fill="hsl(var(--n-module))" />
          {[
            [66, 34],
            [94, 34],
            [66, 62],
            [94, 62],
          ].map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="2.4" fill="hsl(var(--n-file))" />
          ))}
          {[
            [28, 30],
            [28, 66],
          ].map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="3" fill="hsl(var(--n-interface))" />
          ))}
          {[
            [132, 32],
            [132, 64],
          ].map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="3" fill="hsl(var(--n-function))" />
          ))}
        </svg>
      );
    case 'flow':
    default:
      return (
        <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden>
          <g stroke={STROKE} strokeWidth="0.7" opacity="0.55">
            {[
              [30, 30, 78, 24],
              [30, 30, 78, 50],
              [30, 66, 78, 50],
              [30, 66, 78, 74],
              [78, 24, 128, 40],
              [78, 50, 128, 40],
              [78, 74, 128, 68],
            ].map(([x1, y1, x2, y2], index) => (
              <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
          </g>
          {[
            [30, 30],
            [30, 66],
          ].map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="3.4" fill="hsl(var(--n-function))" />
          ))}
          {[
            [78, 24],
            [78, 50],
            [78, 74],
          ].map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="3.4" fill="hsl(var(--n-file))" />
          ))}
          {[
            [128, 40],
            [128, 68],
          ].map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="3.4" fill="hsl(var(--n-interface))" />
          ))}
        </svg>
      );
  }
}
