/**
 * Keyboard shortcuts for the workspace.
 *
 * Bound on window, but never while the user is typing into a field.
 */

import { useEffect } from 'react';
import { LAYOUT_MODES } from '@/graph/layouts';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useSettingsStore } from '@/store/useSettingsStore';

export const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: '⌘K / Ctrl-K', description: 'Search files, modules and symbols' },
  { keys: 'F', description: 'Fit the whole graph in view' },
  { keys: 'R', description: 'Reset the camera' },
  { keys: 'L', description: 'Toggle labels' },
  { keys: 'E', description: 'Toggle relationship edges' },
  { keys: 'I', description: 'Toggle the insights panel' },
  { keys: '1 – 5', description: 'Switch layout mode' },
  { keys: 'Esc', description: 'Clear the selection' },
];

export function useWorkspaceShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const store = useWorkspaceStore.getState();

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        store.setPaletteOpen(!store.paletteOpen);
        return;
      }

      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key.toLowerCase()) {
        case 'f':
          event.preventDefault();
          store.fitView();
          break;
        case 'r':
          event.preventDefault();
          store.resetCamera();
          break;
        case 'l':
          useSettingsStore.getState().toggle('showLabels');
          break;
        case 'e':
          useSettingsStore.getState().toggle('showEdges');
          break;
        case 'i':
          store.togglePanel('insights');
          break;
        case 'escape':
          if (store.paletteOpen) store.setPaletteOpen(false);
          else if (store.tracedPath) store.clearTrace();
          else store.select(null);
          break;
        default: {
          const digit = Number.parseInt(event.key, 10);
          if (digit >= 1 && digit <= LAYOUT_MODES.length) {
            store.setLayoutMode(LAYOUT_MODES[digit - 1]);
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
