/**
 * Visualisation and interface preferences.
 *
 * Kept separate from graph state so toggling a label does not invalidate
 * anything the renderer derives from the graph itself.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyTheme, type ThemeName } from '@/lib/theme';

export type QualityMode = 'auto' | 'high' | 'balanced';

export interface SettingsState {
  theme: ThemeName;
  /** User-controlled motion switch, independent of the OS preference. */
  animations: boolean;
  showLabels: boolean;
  showEdges: boolean;
  showExternalEdges: boolean;
  showHierarchyEdges: boolean;
  showGrid: boolean;
  quality: QualityMode;
  /** Maximum number of labels drawn at once. */
  labelBudget: number;
  legendOpen: boolean;

  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  toggle: (key: 'animations' | 'showLabels' | 'showEdges' | 'showExternalEdges' | 'showHierarchyEdges' | 'showGrid' | 'legendOpen') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      animations: true,
      showLabels: true,
      showEdges: true,
      showExternalEdges: true,
      showHierarchyEdges: true,
      showGrid: true,
      quality: 'auto',
      labelBudget: 42,
      legendOpen: true,

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () =>
        set((state) => {
          const theme: ThemeName = state.theme === 'dark' ? 'light' : 'dark';
          applyTheme(theme);
          return { theme };
        }),
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      toggle: (key) => set((state) => ({ [key]: !state[key] }) as Partial<SettingsState>),
    }),
    {
      name: 'repoverse.settings',
      partialize: (state) => ({
        theme: state.theme,
        animations: state.animations,
        showLabels: state.showLabels,
        showEdges: state.showEdges,
        showExternalEdges: state.showExternalEdges,
        showHierarchyEdges: state.showHierarchyEdges,
        showGrid: state.showGrid,
        quality: state.quality,
        labelBudget: state.labelBudget,
        legendOpen: state.legendOpen,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);

/** True when the OS asks for reduced motion, or the user switched it off. */
export function usePrefersReducedMotion(): boolean {
  const animations = useSettingsStore((state) => state.animations);
  if (!animations) return true;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
