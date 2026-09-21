/**
 * Landing page.
 *
 * One job: make it obvious what RepoVerse does, and get a repository URL into
 * the analyser. The hero renders the real graph renderer rather than a picture
 * of one.
 */

import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  Github,
  Keyboard,
  Layers,
  Moon,
  Network,
  Search,
  ShieldCheck,
  Sun,
  Zap,
} from 'lucide-react';
import { LAYOUT_META, LAYOUT_MODES } from '@/graph/layouts';
import { useSettingsStore } from '@/store/useSettingsStore';
import { HeroScene } from '@/components/landing/HeroScene';
import { LayoutDiagram } from '@/components/landing/LayoutDiagrams';
import { RepositoryInput } from '@/components/landing/RepositoryInput';
import { RepoVerseMark } from '@/components/RepoVerseMark';
import { Button } from '@/components/ui/Button';
import { Badge, Kbd } from '@/components/ui/Primitives';

const EXAMPLE_REPOSITORIES = [
  { repo: 'android/nowinandroid', language: 'Kotlin', note: 'Multi-module Android app with feature and core layers' },
  { repo: 'pallets/flask', language: 'Python', note: 'Compact web framework with a small, clear package tree' },
  { repo: 'expressjs/express', language: 'JavaScript', note: 'Classic Node.js web framework' },
  { repo: 'gin-gonic/gin', language: 'Go', note: 'Go HTTP framework — package-level dependencies' },
  { repo: 'vercel/swr', language: 'TypeScript', note: 'React data fetching library, monorepo layout' },
  { repo: 'square/retrofit', language: 'Java', note: 'Gradle multi-project Java library' },
];

const CAPABILITIES = [
  {
    icon: Network,
    title: 'Real dependency edges',
    body: 'Imports are parsed per language and resolved against the actual file tree — relative paths, tsconfig aliases, Go module paths, JVM packages, Rust modules.',
  },
  {
    icon: Layers,
    title: 'Five spatial layouts',
    body: 'Architecture, dependency galaxy, tree explorer, focused module and dependency flow. Each one answers a different question about the same graph.',
  },
  {
    icon: Search,
    title: 'Search that navigates',
    body: 'Fuzzy search across files, folders, modules, symbols and packages. Pick a result and the camera flies to it with its relationships highlighted.',
  },
  {
    icon: Zap,
    title: 'Built for large repositories',
    body: 'Instanced rendering, level-of-detail labels, budgeted edges and an off-thread layout worker keep thousands of nodes interactive.',
  },
  {
    icon: ShieldCheck,
    title: 'Honest about what it knows',
    body: 'Inferred relationships are marked as inferred, unread files say so, and metrics that could not be measured are shown as unavailable rather than invented.',
  },
  {
    icon: Keyboard,
    title: 'Keyboard-first workspace',
    body: '⌘K search, single-key layout switching, fit and reset camera, label and edge toggles — all without leaving the canvas.',
  },
];

const STEPS = [
  {
    title: 'Paste a repository URL',
    body: 'Any public GitHub repository. RepoVerse validates the URL, resolves the default branch and reads the commit tree.',
  },
  {
    title: 'The server reads the code',
    body: 'Source files are fetched and parsed server-side: modules, symbols, imports and third-party packages become a normalized graph.',
  },
  {
    title: 'Explore the architecture',
    body: 'The graph is laid out in 3D. Orbit it, search it, isolate a module, trace a dependency path, and read any file in place.',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const theme = useSettingsStore((state) => state.theme);
  const toggleTheme = useSettingsStore((state) => state.toggleTheme);

  return (
    <div className="min-h-dvh bg-base bg-spatial">
      {/* Nav ------------------------------------------------------------ */}
      <header className="sticky top-0 z-chrome border-b border-line/70 bg-base/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
            <RepoVerseMark className="h-5 w-5" />
            RepoVerse
          </Link>
          <nav className="flex items-center gap-1">
            <a
              href="#how-it-works"
              className="hidden rounded-sm px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-ink sm:block"
            >
              How it works
            </a>
            <a
              href="#layouts"
              className="hidden rounded-sm px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-ink sm:block"
            >
              Layouts
            </a>
            <a
              href="#examples"
              className="hidden rounded-sm px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-ink sm:block"
            >
              Examples
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted transition-colors hover:bg-elevated/70 hover:text-ink"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Button size="sm" variant="secondary" onClick={() => navigate('/workspace?demo=1')}>
              Open demo
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero ----------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-technical-grid opacity-[0.35]" aria-hidden />
        <HeroScene className="pointer-events-none absolute right-[-12%] top-[-6%] hidden h-[125%] w-[62%] lg:block" />

        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 lg:pb-28 lg:pt-24">
          <div className="max-w-2xl">
            <Badge tone="accent" className="animate-fade-in">
              <Boxes className="h-3 w-3" />
              Interactive 3D repository visualizer
            </Badge>

            <h1 className="text-balance pt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl lg:text-6xl animate-fade-up">
              See Your Codebase
              <br />
              Come to Life.
            </h1>

            <p className="max-w-xl text-balance pt-5 text-base leading-relaxed text-muted animate-fade-up">
              Turn any public GitHub repository into an interactive 3D map of its architecture, dependencies and
              connections.
            </p>

            <div className="max-w-2xl pt-8 animate-fade-up">
              <RepositoryInput autoFocus />
            </div>
          </div>

          <HeroScene className="pointer-events-none mt-10 h-64 w-full lg:hidden" />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-base" aria-hidden />
      </section>

      {/* Product preview ------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <WorkspacePreview />
      </section>

      {/* How it works --------------------------------------------------- */}
      <section id="how-it-works" className="border-t border-line/70 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHeading eyebrow="How it works" title="From a URL to a navigable architecture" />
          <ol className="grid gap-4 pt-10 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-lg border border-line bg-surface/50 p-5">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-line bg-elevated font-mono text-2xs text-accent">
                  {index + 1}
                </span>
                <h3 className="pt-3.5 text-sm font-medium text-ink">{step.title}</h3>
                <p className="pt-1.5 text-xs leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Layout modes --------------------------------------------------- */}
      <section id="layouts" className="border-t border-line/70 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHeading
            eyebrow="Architecture views"
            title="Five ways to read the same graph"
            description="Layouts are deterministic — the same analysis always produces the same arrangement, so you can learn a repository's shape instead of relearning it every refresh."
          />
          <div className="grid gap-4 pt-10 sm:grid-cols-2 lg:grid-cols-3">
            {LAYOUT_MODES.map((mode) => (
              <article key={mode} className="group rounded-lg border border-line bg-surface/50 p-4 transition-colors hover:border-line-strong">
                <div className="h-24 rounded-md border border-line/70 bg-base/60 p-2">
                  <LayoutDiagram mode={mode} />
                </div>
                <div className="flex items-center justify-between gap-2 pt-3.5">
                  <h3 className="text-sm font-medium text-ink">{LAYOUT_META[mode].label}</h3>
                  <Kbd>{LAYOUT_META[mode].shortcut}</Kbd>
                </div>
                <p className="pt-1.5 text-xs leading-relaxed text-muted">{LAYOUT_META[mode].description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities --------------------------------------------------- */}
      <section className="border-t border-line/70 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHeading eyebrow="Capabilities" title="A developer tool, not a dashboard" />
          <div className="grid gap-4 pt-10 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((capability) => (
              <article key={capability.title} className="rounded-lg border border-line bg-surface/50 p-5">
                <capability.icon className="h-4 w-4 text-accent" />
                <h3 className="pt-3 text-sm font-medium text-ink">{capability.title}</h3>
                <p className="pt-1.5 text-xs leading-relaxed text-muted">{capability.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Examples ------------------------------------------------------- */}
      <section id="examples" className="border-t border-line/70 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHeading
            eyebrow="Try it on"
            title="Public repositories worth exploring"
            description="These run a real analysis against GitHub's public API. Larger repositories take longer and may hit the unauthenticated rate limit."
          />
          <div className="grid gap-2.5 pt-10 sm:grid-cols-2 lg:grid-cols-3">
            {EXAMPLE_REPOSITORIES.map((example) => (
              <button
                key={example.repo}
                type="button"
                onClick={() => navigate(`/analyze?repo=${encodeURIComponent(example.repo)}`)}
                className="group flex items-start gap-3 rounded-lg border border-line bg-surface/50 p-4 text-left transition-colors hover:border-accent/40 hover:bg-elevated/40"
              >
                <Github className="mt-0.5 h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs text-ink">{example.repo}</span>
                    <span className="chip shrink-0">{example.language}</span>
                  </span>
                  <span className="block pt-1 text-2xs leading-snug text-faint">{example.note}</span>
                </span>
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 -translate-x-1 text-faint opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA ------------------------------------------------------ */}
      <section className="border-t border-line/70 py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-[-0.02em] text-ink">
            What does your repository look like?
          </h2>
          <p className="text-balance pt-3 text-sm leading-relaxed text-muted">
            Paste a URL and find out. No account, no installation, nothing written back to GitHub.
          </p>
          <div className="mx-auto max-w-xl pt-8">
            <RepositoryInput />
          </div>
        </div>
      </section>

      {/* Footer --------------------------------------------------------- */}
      <footer className="border-t border-line/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-faint">
            <RepoVerseMark className="h-4 w-4" />
            RepoVerse — interactive 3D repository visualizer
          </div>
          <div className="flex items-center gap-4 text-2xs text-faint">
            <Link to="/workspace?demo=1" className="transition-colors hover:text-muted">
              Demo workspace
            </Link>
            <a
              href="https://github.com/Misbah542/Pyramid"
              target="_blank"
              rel="noreferrer noopener"
              className="transition-colors hover:text-muted"
            >
              Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-accent">{eyebrow}</p>
      <h2 className="text-balance pt-2.5 text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">{title}</h2>
      {description ? <p className="text-balance pt-3 text-sm leading-relaxed text-muted">{description}</p> : null}
    </div>
  );
}

/**
 * A framed preview of the workspace chrome around a live mini-render — the
 * panels are the real components' styling, not a screenshot.
 */
function WorkspacePreview() {
  const navigate = useNavigate();

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface/60 shadow-panel backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </div>
        <span className="ml-2 truncate font-mono text-2xs text-faint">repoverse/helio · main · demo repository</span>
        <span className="ml-auto hidden items-center gap-1 rounded-sm border border-line bg-elevated/60 px-1.5 py-0.5 text-2xs text-faint sm:flex">
          <Search className="h-3 w-3" />
          ⌘K
        </span>
      </div>

      <div className="grid h-[22rem] grid-cols-1 md:grid-cols-[13rem_1fr_14rem]">
        <div className="hidden flex-col gap-1 border-r border-line p-2.5 md:flex">
          <p className="pb-1 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Explorer</p>
          {[
            ['apps', 0, 'module'],
            ['web', 1, 'directory'],
            ['src', 2, 'directory'],
            ['App.tsx', 3, 'file'],
            ['mobile', 1, 'directory'],
            ['services', 0, 'module'],
            ['packages', 0, 'module'],
            ['design-system', 1, 'package'],
            ['core-sdk', 1, 'package'],
          ].map(([name, depth, type], index) => (
            <div
              key={index}
              className="flex items-center gap-1.5 rounded-sm py-0.5 font-mono text-2xs text-muted"
              style={{ paddingLeft: 4 + (depth as number) * 10 }}
            >
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: `hsl(var(--n-${type}))` }} />
              {name}
            </div>
          ))}
        </div>

        <div className="relative min-h-0 border-line md:border-r">
          <HeroScene className="absolute inset-0" />
          <button
            type="button"
            onClick={() => navigate('/workspace?demo=1')}
            className="absolute inset-0 flex items-end justify-center pb-5"
          >
            <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface/90 px-3.5 py-2 text-xs font-medium text-ink shadow-pop backdrop-blur transition-colors hover:border-accent/50">
              Open the interactive demo
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </button>
        </div>

        <div className="hidden flex-col gap-2 p-2.5 md:flex">
          <p className="pb-0.5 text-2xs font-semibold uppercase tracking-[0.08em] text-faint">Inspector</p>
          <p className="font-mono text-xs text-ink">ProjectRepository.kt</p>
          <div className="flex flex-wrap gap-1">
            <span className="chip">Source file</span>
            <span className="chip">Kotlin</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {[
              ['Lines', '168'],
              ['Imports out', '5'],
              ['Imported by', '4'],
              ['Size', '6.2 KB'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-line bg-elevated/40 px-2 py-1.5">
                <div className="text-[0.625rem] uppercase tracking-wide text-faint">{label}</div>
                <div className="font-mono text-2xs text-ink">{value}</div>
              </div>
            ))}
          </div>
          <p className="pt-1 text-2xs font-medium text-muted">Depends on</p>
          {['HelioApiClient.kt', 'Project.kt', 'ProjectSource.kt'].map((name) => (
            <div key={name} className="flex items-center gap-1.5 font-mono text-2xs text-faint">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'hsl(var(--n-file))' }} />
              {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
