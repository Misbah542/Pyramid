# RepoVerse

**Turn any public GitHub repository into an interactive 3D map of its architecture, dependencies and connections.**

RepoVerse reads a repository server-side — its file tree, its source files, its imports — builds a normalized
graph out of what it finds, and renders that graph as a navigable 3D world. It is built for the moment you open an
unfamiliar codebase and need to know its shape before you can read any of it.

The 3D scene is the product, not decoration: every node is a real file, directory, symbol or package, every edge is
a relationship the analyser actually detected, and every number in the interface was measured rather than estimated.

---

## Quick start

```bash
npm install
cp .env.example .env     # optional — see "GitHub rate limits" below
npm run dev
```

`npm run dev` starts two processes:

| Process | Port | What it does |
| --- | --- | --- |
| Vite dev server | `5173` | Serves the app, proxies `/api` to the API |
| Analysis API | `8787` | Fetches and parses repositories, builds the graph |

Open <http://localhost:5173>. Paste a public GitHub repository URL, or click **View Demo** to explore a bundled
sample graph with no network calls at all.

### Production

```bash
npm run build     # typecheck + bundle the client into dist/
npm start         # serves dist/ and the API from one Node process on $API_PORT
```

### Other commands

```bash
npm run typecheck   # tsc --noEmit across client, server and shared code
npm test            # vitest — graph utilities, parsers, resolver, layouts
npm run dev:web     # client only (demo mode works; live analysis will not)
npm run dev:server  # API only
```

---

## GitHub rate limits

RepoVerse talks to GitHub's public REST API. Unauthenticated, GitHub allows **60 requests per hour per IP**, which
is enough for a couple of small repositories. Setting a token raises that to 5,000/hour:

```bash
# .env
GITHUB_TOKEN=github_pat_...   # no scopes needed — public data only
```

The token is read **only** by the server process (`server/config.ts`) and is never serialised into any API response
or shipped to the browser. The browser never talks to GitHub directly.

File contents are fetched from `raw.githubusercontent.com` where possible, which does not consume the REST quota;
the contents API is the fallback. Analysed graphs and fetched files are cached in memory for 15 minutes, so
re-running an analysis is cheap.

---

## How the analysis works

```
   Browser                          Analysis API                    GitHub
   ───────                          ────────────                    ──────
   paste URL ──────────────────────▶ validate owner/repo
                                     GET /repos/{owner}/{repo} ─────▶ metadata, default branch
                                     GET /git/trees?recursive=1 ────▶ full file tree
                                     select analysable files
                                     fetch source (concurrently) ───▶ raw.githubusercontent.com
                                     parse imports + symbols
                                     resolve imports → files/packages
   graph ◀───────────────────────── build RepositoryGraph
   layout in a Web Worker
   render with three.js
```

Progress is streamed back over server-sent events (`GET /api/analyze/stream`). Each stage is reported when it
**actually finishes** — the progress screen has no simulated percentages. The last two stages (spatial layout,
preparing the scene) run in the browser and are reported by the layout worker.

### Supported languages

Import resolution and symbol extraction are implemented per language in `server/analysis/parsers.ts` and
`server/analysis/resolve.ts`:

| Language | Imports resolved as | Symbols extracted |
| --- | --- | --- |
| TypeScript / JavaScript / Vue / Svelte | relative paths, directory indexes, `tsconfig` path aliases, npm & node builtins | classes, interfaces, functions, arrow consts |
| Python | relative (`.`/`..`), package paths, stdlib vs PyPI | classes, module-level functions |
| Go | module path from `go.mod` → package directories, stdlib vs modules | structs, interfaces, funcs |
| Java / Kotlin / Scala | dotted type names against JVM source roots, JDK vs Maven coordinates | classes, interfaces, objects, traits, functions |
| Rust | `crate::` / `self::` / `super::` modules, std vs crates | structs, traits, impls, fns |
| Swift, Dart, Ruby, PHP, C#, C/C++ | best-effort, ecosystem-aware | types and functions |

Other extensions (Markdown, YAML, SQL, shell, …) still appear as nodes so the structure is complete; they simply
contribute no dependency edges.

### What "detected" means

This matters, so RepoVerse is explicit about it in the UI as well as here:

- Edges are **static** relationships found by reading source text. An import edge means "this file imports that
  file", not "this code runs that code". The interface never claims otherwise.
- Relationships the resolver matched by convention rather than by an exact path are marked `heuristic` and shown
  with a `~` in the inspector.
- Files that were not opened (size or request limits) appear in the structure but have no line count and produce no
  edges. The inspector says "Not read" rather than showing a zero.
- Insights that could not be computed render an explicit **Not available** state instead of a plausible number.
- A repository analysis can be `complete` or `partial`; partial analyses list exactly what was truncated and why.

---

## API

All routes are under `/api` and are rate-limited per client IP.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Service status, whether a token is configured, GitHub rate-limit snapshot, active limits |
| `GET /api/analyze?repo=owner/name[&ref=branch][&fresh=1]` | Analyse a repository, respond with `{ graph }` |
| `GET /api/analyze/stream?repo=owner/name[&ref=branch]` | Same analysis as a server-sent `AnalysisEvent` stream |
| `GET /api/source?repo=owner/name&ref=sha&path=...` | Read one file for the inspector's source preview |

`AnalysisEvent` is a discriminated union (`stage`, `repository`, `warning`, `result`, `error`) defined in
`shared/graph.ts` — the same file the client imports, so the contract cannot drift.

### Security boundaries

- Only `github.com` URLs are accepted, parsed by `shared/repo-url.ts` on both sides. The client check is for
  feedback; the server re-validates before anything is fetched.
- Git refs and file paths are checked for traversal (`..`, absolute paths, backslashes) before they reach a URL.
- Repository code is never executed. Source is rendered by tokenising it locally and emitting React text nodes —
  nothing is inserted as HTML.
- Resource limits (tree entries, parsed files, file size, whole-analysis timeout, repository size) are all
  configurable in `.env`; see `server/config.ts` for defaults.

---

## The graph data model

```ts
RepositoryGraph {
  repository: RepositoryInfo      // owner, name, branch, commit, languages, isDemo
  nodes:      GraphNode[]         // id, type, name, path, parentId, moduleId, language, metadata
  edges:      GraphEdge[]         // id, source, target, type, direction, metadata
  metadata:   GraphMetadata       // counts, language stats, duration, truncation
  analysisStatus: 'complete' | 'partial' | 'failed'
  warnings:   AnalysisWarning[]
}
```

Node types: `repository`, `module`, `package`, `directory`, `file`, `test`, `config`, `class`, `interface`,
`function`, `external`.

Edge types: `contains`, `declares`, `import`, `module-dependency`, `external-dependency`, `test-of`, `extends`,
`implements`.

The schema lives in `shared/` and is imported by both the server and the client, so adding a language parser or a
relationship type never requires touching the renderer.

---

## The workspace

| Layout | Key | What it answers |
| --- | --- | --- |
| Architecture | `1` | How is this repository organised at the top level? |
| Dependency Galaxy | `2` | Which files actually cluster together by coupling? |
| Tree Explorer | `3` | What does the directory hierarchy look like? |
| Focused Module | `4` | What does this one module contain, and what does it touch? |
| Dependency Flow | `5` | Which direction do the dependencies run? |

Layouts are **deterministic**: the same analysed graph always produces the same arrangement, so a repository's
shape is something you can learn rather than relearn on every refresh. All randomness comes from a hash of the node
id (`src/graph/rng.ts`), never `Math.random`.

### Keyboard

| Key | Action |
| --- | --- |
| `⌘K` / `Ctrl-K` | Search files, folders, modules, symbols and packages |
| `F` | Fit the whole graph in view |
| `R` | Reset the camera |
| `L` | Toggle labels |
| `E` | Toggle relationship edges |
| `I` | Toggle the insights panel |
| `1`–`5` | Switch layout mode |
| `Esc` | Clear selection / close the palette |

Mouse: drag to orbit, right-drag or two-finger to pan, scroll to zoom, click to select, shift-click to pin a second
node (then trace a dependency path between them from the inspector), double-click to focus the camera.

---

## Performance

The renderer is built for repositories that are too big to read by hand:

- **Instanced meshes** — one draw call per node shape, not per node.
- **A single merged geometry per edge style**, rebuilt in place on typed arrays rather than through React.
- **Budgeted labels** with screen-space collision culling: only the highest-priority labels that actually fit are
  drawn, so dense clusters stay legible.
- **Layout in a Web Worker** above 400 nodes, with a synchronous fallback.
- **Depth-based level of detail** — large repositories open at module level and expand on demand.
- **Adaptive resolution** while the camera moves (`Auto` quality), switchable to `High` or `Fast`.
- **Edge budgeting** — when a graph exceeds the segment budget, the most meaningful relationship types are kept
  first and the status bar reports how many of the total are drawn.

If sustained frame times drop below ~24fps the status bar says so and suggests what to reduce. If WebGL is
unavailable entirely, the workspace falls back to a DOM module map that keeps the explorer, search and inspector
working.

---

## Project structure

```
shared/              Graph schema and pure graph utilities (imported by client AND server)
  graph.ts             Node/edge/metadata types, analysis event protocol
  graph-utils.ts       Index building, traversal, path finding, cycle detection, filters
  graph-build.ts       Derived-count computation shared by the analyser and the demo
  repo-url.ts          GitHub URL parsing — the single gate on what may be fetched
  language.ts          Extension → language, test/config/vendored conventions

server/
  index.ts             Express app, per-IP throttle, static hosting in production
  config.ts            Resource limits, token
  github.ts            GitHub REST client, rate-limit handling, error mapping
  cache.ts             TTL + LRU cache
  routes/analyze.ts    /health, /analyze, /analyze/stream, /source
  analysis/
    analyze.ts         The pipeline: tree → selection → parse → resolve → graph
    parsers.ts         Per-language import and symbol extraction
    resolve.ts         Import specifier → repository file or third-party package

src/
  graph/               Layout engine (5 modes), layout worker, fuzzy search, insights
  components/scene/    three.js renderer: instanced nodes, edges, labels, camera rig
  components/workspace/Explorer, inspector, insights, palette, legend, bars
  components/landing/  Hero scene (the real renderer), repository input, diagrams
  store/               Zustand stores — graph/selection state and view settings
  demo/                The bundled demo repository graph

tests/                 Vitest: URL parsing, graph utilities, parsers, resolver, layouts
```

---

## Adding a language

1. Add the extensions to `LANGUAGES` in `shared/language.ts` with `parsable: true`.
2. Add extractors to `LANGUAGE_PARSERS` in `server/analysis/parsers.ts` (imports and, optionally, symbols).
3. Add a case to `resolveImport` in `server/analysis/resolve.ts` mapping specifiers to repository paths or to a
   package ecosystem.
4. Add a test to `tests/parsers.test.ts` and `tests/resolve.test.ts`.

Nothing in `src/` needs to change — the renderer only knows about the shared schema.

---

## Demo mode

`/workspace?demo=1` loads a synthetic repository (`repoverse/helio`) built in `src/demo/demo-graph.ts`: a polyglot
monorepo with a React web app, a Kotlin Android app, a Go service and two shared TypeScript packages, plus tests,
config and third-party dependencies. It is clearly labelled **Demo repository** everywhere it appears and is not
presented as any real project's architecture. It exercises every node type, every edge type and every layout, and
it runs entirely in the browser with no network access.
