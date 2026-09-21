/**
 * Workspace top bar: repository context on the left, view controls on the right.
 */

import { Link } from 'react-router-dom';
import { GitBranch, Github, LayoutGrid, Lightbulb, Moon, PanelLeft, PanelRight, Search, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LAYOUT_META, LAYOUT_MODES, type LayoutMode } from '@/graph/layouts';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, Kbd, Tooltip } from '@/components/ui/Primitives';
import { RepoVerseMark } from '@/components/RepoVerseMark';
import { ViewSettingsMenu } from './ViewSettingsMenu';

export function WorkspaceTopBar() {
  const graph = useWorkspaceStore((state) => state.graph);
  const layoutMode = useWorkspaceStore((state) => state.layoutMode);
  const setLayoutMode = useWorkspaceStore((state) => state.setLayoutMode);
  const setPaletteOpen = useWorkspaceStore((state) => state.setPaletteOpen);
  const togglePanel = useWorkspaceStore((state) => state.togglePanel);
  const explorerOpen = useWorkspaceStore((state) => state.explorerOpen);
  const inspectorOpen = useWorkspaceStore((state) => state.inspectorOpen);
  const insightsOpen = useWorkspaceStore((state) => state.insightsOpen);
  const theme = useSettingsStore((state) => state.theme);
  const toggleTheme = useSettingsStore((state) => state.toggleTheme);

  const repository = graph?.repository;

  return (
    <header
      className="relative z-chrome flex h-[var(--topbar-h)] shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-2.5 backdrop-blur-xl"
      style={{ height: 'var(--topbar-h)' }}
    >
      <Link to="/" className="flex shrink-0 items-center gap-2 rounded-sm px-1 py-1" aria-label="RepoVerse home">
        <RepoVerseMark className="h-5 w-5" />
        <span className="hidden text-sm font-semibold tracking-tight text-ink sm:inline">RepoVerse</span>
      </Link>

      <div className="mx-1 hidden h-5 w-px bg-line sm:block" />

      {repository ? (
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="shrink-0 truncate font-mono text-xs text-ink" title={repository.fullName}>
            {repository.fullName}
          </span>
          <span
            className="hidden max-w-[16rem] shrink items-center gap-1 overflow-hidden whitespace-nowrap rounded-sm border border-line bg-elevated/60 px-1.5 py-0.5 font-mono text-2xs text-muted md:inline-flex"
            title={`${repository.branch}${repository.commit ? ` @ ${repository.commit}` : ''}`}
          >
            <GitBranch className="h-3 w-3 shrink-0" />
            <span className="truncate">{repository.branch}</span>
            {repository.commit ? <span className="shrink-0 text-faint">@{repository.commit.slice(0, 7)}</span> : null}
          </span>
          {repository.isDemo ? <Badge tone="accent">Demo repository</Badge> : null}
          {graph?.analysisStatus === 'partial' ? <Badge tone="warning">Partial analysis</Badge> : null}
        </div>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden h-8 items-center gap-2 rounded-md border border-line bg-elevated/50 px-2.5 text-2xs text-faint transition-colors hover:border-line-strong hover:text-muted lg:flex"
        >
          <Search className="h-3.5 w-3.5" />
          Search repository
          <Kbd className="ml-2">⌘K</Kbd>
        </button>
        <IconButton label="Search repository" className="lg:hidden" onClick={() => setPaletteOpen(true)}>
          <Search className="h-4 w-4" />
        </IconButton>

        <LayoutSwitcher value={layoutMode} onChange={setLayoutMode} />

        <div className="mx-0.5 hidden h-5 w-px bg-line md:block" />

        <IconButton
          label="Toggle explorer"
          active={explorerOpen}
          onClick={() => togglePanel('explorer')}
          className="hidden md:inline-flex"
        >
          <PanelLeft className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Toggle inspector"
          active={inspectorOpen}
          onClick={() => togglePanel('inspector')}
          className="hidden md:inline-flex"
        >
          <PanelRight className="h-4 w-4" />
        </IconButton>
        <IconButton label="Repository insights" active={insightsOpen} onClick={() => togglePanel('insights')}>
          <Lightbulb className="h-4 w-4" />
        </IconButton>
        <ViewSettingsMenu />
        <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </IconButton>
        {repository?.url ? (
          <a
            href={repository.url}
            target="_blank"
            rel="noreferrer noopener"
            title="Open repository on GitHub"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted transition-colors hover:bg-elevated/70 hover:text-ink"
          >
            <Github className="h-4 w-4" />
          </a>
        ) : null}
      </div>
    </header>
  );
}

function LayoutSwitcher({ value, onChange }: { value: LayoutMode; onChange: (mode: LayoutMode) => void }) {
  return (
    <div className="hidden items-center gap-0.5 rounded-md border border-line bg-elevated/50 p-0.5 xl:flex">
      {LAYOUT_MODES.map((mode) => (
        <Tooltip
          key={mode}
          content={
            <span className="block max-w-[15rem] text-left">
              <span className="block font-medium text-ink">{LAYOUT_META[mode].label}</span>
              <span className="block pt-0.5 leading-snug">{LAYOUT_META[mode].description}</span>
            </span>
          }
        >
          <button
            type="button"
            onClick={() => onChange(mode)}
            aria-pressed={value === mode}
            className={cn(
              'rounded-sm px-2 py-1 text-2xs font-medium transition-colors duration-fast',
              value === mode ? 'bg-surface text-ink shadow-sm' : 'text-faint hover:text-muted',
            )}
          >
            {LAYOUT_META[mode].label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

export function CompactLayoutSwitcher() {
  const layoutMode = useWorkspaceStore((state) => state.layoutMode);
  const setLayoutMode = useWorkspaceStore((state) => state.setLayoutMode);

  return (
    <label className="flex items-center gap-1.5 text-2xs text-faint">
      <LayoutGrid className="h-3.5 w-3.5" />
      <span className="sr-only">Layout mode</span>
      <select
        value={layoutMode}
        onChange={(event) => setLayoutMode(event.target.value as LayoutMode)}
        className="rounded-sm border border-line bg-elevated/60 px-1.5 py-0.5 text-2xs text-ink outline-none"
      >
        {LAYOUT_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {LAYOUT_META[mode].label}
          </option>
        ))}
      </select>
    </label>
  );
}

export { Button };
