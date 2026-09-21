/**
 * View settings popover — how the scene looks, not what it contains.
 */

import { useEffect, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSettingsStore, type QualityMode } from '@/store/useSettingsStore';
import { IconButton } from '@/components/ui/Button';
import { Segmented, Switch } from '@/components/ui/Primitives';

export function ViewSettingsMenu() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const settings = useSettingsStore();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <IconButton label="View settings" active={open} onClick={() => setOpen((value) => !value)}>
        <Settings2 className="h-4 w-4" />
      </IconButton>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-overlay w-72 rounded-lg border border-line bg-overlay/95 p-3 shadow-pop backdrop-blur-xl animate-scale-in">
          <h3 className="pb-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Scene</h3>
          <Switch
            label="Node labels"
            description="Labels are budgeted by importance and camera distance."
            checked={settings.showLabels}
            onChange={() => settings.toggle('showLabels')}
          />
          <Switch label="Relationship edges" checked={settings.showEdges} onChange={() => settings.toggle('showEdges')} />
          <Switch
            label="Hierarchy edges"
            description="Lines from a directory to what it contains."
            checked={settings.showHierarchyEdges}
            onChange={() => settings.toggle('showHierarchyEdges')}
          />
          <Switch
            label="External package edges"
            checked={settings.showExternalEdges}
            onChange={() => settings.toggle('showExternalEdges')}
          />
          <Switch label="Ground grid" checked={settings.showGrid} onChange={() => settings.toggle('showGrid')} />

          <div className="mt-2 flex items-center justify-between border-t border-line pt-2.5">
            <label htmlFor="label-budget" className="text-xs text-ink">
              Label budget
            </label>
            <span className="font-mono text-2xs text-muted">{settings.labelBudget}</span>
          </div>
          <input
            id="label-budget"
            type="range"
            min={8}
            max={120}
            step={2}
            value={settings.labelBudget}
            onChange={(event) => settings.set('labelBudget', Number(event.target.value))}
            className="w-full accent-[hsl(var(--c-accent))]"
          />

          <h3 className="pb-1.5 pt-3 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Motion</h3>
          <Switch
            label="Animated transitions"
            description="Turn off for instant camera and layout changes. Your system reduced-motion setting is always respected."
            checked={settings.animations}
            onChange={() => settings.toggle('animations')}
          />

          <h3 className="pb-1.5 pt-3 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Render quality</h3>
          <Segmented<QualityMode>
            size="sm"
            className="w-full"
            value={settings.quality}
            onChange={(value) => settings.set('quality', value)}
            options={[
              { value: 'auto', label: 'Auto', title: 'Adapts resolution to the frame rate' },
              { value: 'high', label: 'High', title: 'Full resolution and antialiasing' },
              { value: 'balanced', label: 'Fast', title: 'Lower resolution for weaker GPUs' },
            ]}
          />
          <p className={cn('pt-1.5 text-2xs leading-snug text-faint')}>
            Auto lowers resolution while the camera moves and restores it when it settles.
          </p>
        </div>
      ) : null}
    </div>
  );
}
