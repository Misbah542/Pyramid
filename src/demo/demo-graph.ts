/**
 * Demo repository.
 *
 * `helio` is a synthetic codebase authored for this demo — it is not a mirror
 * of any real project, and nothing here is presented as one. It exists so the
 * workspace can be explored end to end without a GitHub request: several
 * languages, nested modules, internal and external dependencies, tests and
 * configuration, wired together the way a real product repository would be.
 */

import type { GraphEdge, GraphNode, LanguageStat, NodeType, RepositoryGraph, SymbolRef } from '@shared/graph';
import { annotateDerivedCounts } from '@shared/graph-build';
import { detectLanguage, isConfigFile, isTestFile } from '@shared/language';

interface DemoSymbol {
  name: string;
  kind: 'class' | 'interface' | 'function';
  line: number;
  extends?: string;
}

interface DemoFile {
  path: string;
  lines: number;
  imports?: string[];
  externals?: string[];
  symbols?: DemoSymbol[];
}

const EXTERNALS: Record<string, string> = {
  react: 'npm',
  'react-dom': 'npm',
  'react-router-dom': 'npm',
  zustand: 'npm',
  '@tanstack/react-query': 'npm',
  zod: 'npm',
  'date-fns': 'npm',
  clsx: 'npm',
  vitest: 'npm',
  'androidx.compose': 'maven',
  'androidx.lifecycle': 'maven',
  'dagger.hilt': 'maven',
  'com.squareup.retrofit2': 'maven',
  'kotlinx.coroutines': 'maven',
  'org.junit.jupiter': 'maven',
  'github.com/go-chi/chi': 'go',
  'github.com/jackc/pgx': 'go',
  'go.uber.org/zap': 'go',
  'database/sql': 'go-std',
  'encoding/json': 'go-std',
  'net/http': 'go-std',
  context: 'go-std',
};

const FILES: DemoFile[] = [
  /* ---------------------------------------------------------- apps/web */
  {
    path: 'apps/web/src/main.tsx',
    lines: 24,
    imports: ['apps/web/src/App.tsx', 'apps/web/src/store/session.ts'],
    externals: ['react', 'react-dom'],
  },
  {
    path: 'apps/web/src/App.tsx',
    lines: 86,
    imports: [
      'apps/web/src/routes/DashboardRoute.tsx',
      'apps/web/src/routes/ProjectRoute.tsx',
      'apps/web/src/routes/SettingsRoute.tsx',
      'apps/web/src/components/AppShell.tsx',
    ],
    externals: ['react', 'react-router-dom'],
    symbols: [{ name: 'App', kind: 'function', line: 18 }],
  },
  {
    path: 'apps/web/src/components/AppShell.tsx',
    lines: 142,
    imports: ['packages/design-system/src/Sidebar.tsx', 'packages/design-system/src/TopBar.tsx', 'apps/web/src/store/session.ts'],
    externals: ['react', 'clsx'],
    symbols: [{ name: 'AppShell', kind: 'function', line: 22 }],
  },
  {
    path: 'apps/web/src/routes/DashboardRoute.tsx',
    lines: 198,
    imports: [
      'apps/web/src/features/metrics/MetricsPanel.tsx',
      'apps/web/src/features/metrics/useMetrics.ts',
      'packages/design-system/src/Card.tsx',
    ],
    externals: ['react', '@tanstack/react-query'],
    symbols: [{ name: 'DashboardRoute', kind: 'function', line: 31 }],
  },
  {
    path: 'apps/web/src/routes/ProjectRoute.tsx',
    lines: 221,
    imports: [
      'apps/web/src/features/projects/ProjectHeader.tsx',
      'apps/web/src/features/projects/ProjectTimeline.tsx',
      'apps/web/src/features/projects/useProject.ts',
      'packages/design-system/src/Card.tsx',
    ],
    externals: ['react', '@tanstack/react-query'],
    symbols: [{ name: 'ProjectRoute', kind: 'function', line: 28 }],
  },
  {
    path: 'apps/web/src/routes/SettingsRoute.tsx',
    lines: 164,
    imports: ['apps/web/src/store/session.ts', 'packages/design-system/src/Card.tsx', 'packages/core-sdk/src/client.ts'],
    externals: ['react'],
    symbols: [{ name: 'SettingsRoute', kind: 'function', line: 24 }],
  },
  {
    path: 'apps/web/src/features/metrics/MetricsPanel.tsx',
    lines: 176,
    imports: ['apps/web/src/features/metrics/useMetrics.ts', 'packages/design-system/src/Chart.tsx'],
    externals: ['react', 'date-fns'],
    symbols: [{ name: 'MetricsPanel', kind: 'function', line: 19 }],
  },
  {
    path: 'apps/web/src/features/metrics/useMetrics.ts',
    lines: 94,
    imports: ['packages/core-sdk/src/client.ts', 'packages/core-sdk/src/types.ts'],
    externals: ['@tanstack/react-query'],
    symbols: [{ name: 'useMetrics', kind: 'function', line: 14 }],
  },
  {
    path: 'apps/web/src/features/metrics/useMetrics.test.ts',
    lines: 68,
    imports: ['apps/web/src/features/metrics/useMetrics.ts'],
    externals: ['vitest'],
  },
  {
    path: 'apps/web/src/features/projects/ProjectHeader.tsx',
    lines: 118,
    imports: ['packages/design-system/src/Badge.tsx', 'packages/core-sdk/src/types.ts'],
    externals: ['react'],
    symbols: [{ name: 'ProjectHeader', kind: 'function', line: 16 }],
  },
  {
    path: 'apps/web/src/features/projects/ProjectTimeline.tsx',
    lines: 232,
    imports: ['packages/design-system/src/Card.tsx', 'apps/web/src/features/projects/useProject.ts'],
    externals: ['react', 'date-fns'],
    symbols: [{ name: 'ProjectTimeline', kind: 'function', line: 34 }],
  },
  {
    path: 'apps/web/src/features/projects/useProject.ts',
    lines: 112,
    imports: ['packages/core-sdk/src/client.ts', 'packages/core-sdk/src/types.ts', 'apps/web/src/store/session.ts'],
    externals: ['@tanstack/react-query'],
    symbols: [{ name: 'useProject', kind: 'function', line: 18 }],
  },
  {
    path: 'apps/web/src/features/projects/useProject.test.ts',
    lines: 74,
    imports: ['apps/web/src/features/projects/useProject.ts'],
    externals: ['vitest'],
  },
  {
    path: 'apps/web/src/store/session.ts',
    lines: 88,
    imports: ['packages/core-sdk/src/client.ts'],
    externals: ['zustand'],
    symbols: [{ name: 'useSessionStore', kind: 'function', line: 21 }],
  },
  { path: 'apps/web/package.json', lines: 42 },
  { path: 'apps/web/vite.config.ts', lines: 28, externals: ['react'] },

  /* ------------------------------------------------------- apps/mobile */
  {
    path: 'apps/mobile/src/MainActivity.kt',
    lines: 96,
    imports: ['apps/mobile/src/navigation/HelioNavHost.kt', 'apps/mobile/src/di/AppModule.kt'],
    externals: ['androidx.compose', 'dagger.hilt'],
    symbols: [{ name: 'MainActivity', kind: 'class', line: 24, extends: 'ComponentActivity' }],
  },
  {
    path: 'apps/mobile/src/navigation/HelioNavHost.kt',
    lines: 134,
    imports: [
      'apps/mobile/src/feature/dashboard/DashboardScreen.kt',
      'apps/mobile/src/feature/project/ProjectScreen.kt',
      'apps/mobile/src/feature/settings/SettingsScreen.kt',
    ],
    externals: ['androidx.compose'],
    symbols: [{ name: 'HelioNavHost', kind: 'function', line: 28 }],
  },
  {
    path: 'apps/mobile/src/di/AppModule.kt',
    lines: 78,
    imports: ['apps/mobile/src/data/HelioApiClient.kt', 'apps/mobile/src/data/ProjectRepository.kt'],
    externals: ['dagger.hilt', 'com.squareup.retrofit2'],
    symbols: [{ name: 'AppModule', kind: 'class', line: 18 }],
  },
  {
    path: 'apps/mobile/src/data/HelioApiClient.kt',
    lines: 122,
    imports: ['apps/mobile/src/domain/Project.kt'],
    externals: ['com.squareup.retrofit2', 'kotlinx.coroutines'],
    symbols: [{ name: 'HelioApiClient', kind: 'interface', line: 21 }],
  },
  {
    path: 'apps/mobile/src/data/ProjectRepository.kt',
    lines: 168,
    imports: ['apps/mobile/src/data/HelioApiClient.kt', 'apps/mobile/src/domain/Project.kt', 'apps/mobile/src/domain/ProjectSource.kt'],
    externals: ['kotlinx.coroutines'],
    symbols: [{ name: 'ProjectRepository', kind: 'class', line: 26, extends: 'ProjectSource' }],
  },
  {
    path: 'apps/mobile/src/data/ProjectRepositoryTest.kt',
    lines: 98,
    imports: ['apps/mobile/src/data/ProjectRepository.kt'],
    externals: ['org.junit.jupiter', 'kotlinx.coroutines'],
  },
  {
    path: 'apps/mobile/src/domain/Project.kt',
    lines: 46,
    symbols: [{ name: 'Project', kind: 'class', line: 8 }],
  },
  {
    path: 'apps/mobile/src/domain/ProjectSource.kt',
    lines: 32,
    imports: ['apps/mobile/src/domain/Project.kt'],
    externals: ['kotlinx.coroutines'],
    symbols: [{ name: 'ProjectSource', kind: 'interface', line: 9 }],
  },
  {
    path: 'apps/mobile/src/feature/dashboard/DashboardScreen.kt',
    lines: 186,
    imports: ['apps/mobile/src/feature/dashboard/DashboardViewModel.kt', 'apps/mobile/src/ui/HelioCard.kt'],
    externals: ['androidx.compose'],
    symbols: [{ name: 'DashboardScreen', kind: 'function', line: 34 }],
  },
  {
    path: 'apps/mobile/src/feature/dashboard/DashboardViewModel.kt',
    lines: 124,
    imports: ['apps/mobile/src/data/ProjectRepository.kt', 'apps/mobile/src/domain/Project.kt'],
    externals: ['androidx.lifecycle', 'dagger.hilt', 'kotlinx.coroutines'],
    symbols: [{ name: 'DashboardViewModel', kind: 'class', line: 22, extends: 'ViewModel' }],
  },
  {
    path: 'apps/mobile/src/feature/project/ProjectScreen.kt',
    lines: 214,
    imports: ['apps/mobile/src/feature/project/ProjectViewModel.kt', 'apps/mobile/src/ui/HelioCard.kt', 'apps/mobile/src/ui/HelioTheme.kt'],
    externals: ['androidx.compose'],
    symbols: [{ name: 'ProjectScreen', kind: 'function', line: 41 }],
  },
  {
    path: 'apps/mobile/src/feature/project/ProjectViewModel.kt',
    lines: 148,
    imports: ['apps/mobile/src/data/ProjectRepository.kt', 'apps/mobile/src/domain/Project.kt'],
    externals: ['androidx.lifecycle', 'dagger.hilt', 'kotlinx.coroutines'],
    symbols: [{ name: 'ProjectViewModel', kind: 'class', line: 25, extends: 'ViewModel' }],
  },
  {
    path: 'apps/mobile/src/feature/project/ProjectViewModelTest.kt',
    lines: 86,
    imports: ['apps/mobile/src/feature/project/ProjectViewModel.kt'],
    externals: ['org.junit.jupiter'],
  },
  {
    path: 'apps/mobile/src/feature/settings/SettingsScreen.kt',
    lines: 132,
    imports: ['apps/mobile/src/ui/HelioTheme.kt', 'apps/mobile/src/data/ProjectRepository.kt'],
    externals: ['androidx.compose'],
    symbols: [{ name: 'SettingsScreen', kind: 'function', line: 27 }],
  },
  {
    path: 'apps/mobile/src/ui/HelioCard.kt',
    lines: 74,
    imports: ['apps/mobile/src/ui/HelioTheme.kt'],
    externals: ['androidx.compose'],
    symbols: [{ name: 'HelioCard', kind: 'function', line: 16 }],
  },
  {
    path: 'apps/mobile/src/ui/HelioTheme.kt',
    lines: 92,
    externals: ['androidx.compose'],
    symbols: [{ name: 'HelioTheme', kind: 'function', line: 30 }],
  },
  { path: 'apps/mobile/build.gradle.kts', lines: 64 },

  /* ------------------------------------------------------ services/api */
  {
    path: 'services/api/cmd/server/main.go',
    lines: 112,
    imports: ['services/api/internal/http/router.go', 'services/api/internal/config/config.go', 'services/api/internal/storage/postgres.go'],
    externals: ['net/http', 'go.uber.org/zap'],
    symbols: [{ name: 'main', kind: 'function', line: 28 }],
  },
  {
    path: 'services/api/internal/http/router.go',
    lines: 148,
    imports: ['services/api/internal/http/projects_handler.go', 'services/api/internal/http/metrics_handler.go', 'services/api/internal/http/middleware.go'],
    externals: ['github.com/go-chi/chi', 'net/http'],
    symbols: [{ name: 'NewRouter', kind: 'function', line: 31 }],
  },
  {
    path: 'services/api/internal/http/projects_handler.go',
    lines: 196,
    imports: ['services/api/internal/service/project_service.go', 'services/api/internal/model/project.go'],
    externals: ['net/http', 'encoding/json'],
    symbols: [{ name: 'ProjectsHandler', kind: 'class', line: 22 }],
  },
  {
    path: 'services/api/internal/http/projects_handler_test.go',
    lines: 124,
    imports: ['services/api/internal/http/projects_handler.go'],
    externals: ['net/http'],
  },
  {
    path: 'services/api/internal/http/metrics_handler.go',
    lines: 142,
    imports: ['services/api/internal/service/metrics_service.go'],
    externals: ['net/http', 'encoding/json'],
    symbols: [{ name: 'MetricsHandler', kind: 'class', line: 19 }],
  },
  {
    path: 'services/api/internal/http/middleware.go',
    lines: 96,
    imports: ['services/api/internal/config/config.go'],
    externals: ['net/http', 'go.uber.org/zap'],
    symbols: [{ name: 'RequestLogger', kind: 'function', line: 24 }],
  },
  {
    path: 'services/api/internal/service/project_service.go',
    lines: 218,
    imports: ['services/api/internal/storage/project_store.go', 'services/api/internal/model/project.go'],
    externals: ['context'],
    symbols: [
      { name: 'ProjectService', kind: 'class', line: 18 },
      { name: 'ProjectStore', kind: 'interface', line: 32 },
    ],
  },
  {
    path: 'services/api/internal/service/metrics_service.go',
    lines: 174,
    imports: ['services/api/internal/storage/metrics_store.go', 'services/api/internal/model/metric.go'],
    externals: ['context'],
    symbols: [{ name: 'MetricsService', kind: 'class', line: 16 }],
  },
  {
    path: 'services/api/internal/service/project_service_test.go',
    lines: 138,
    imports: ['services/api/internal/service/project_service.go'],
    externals: ['context'],
  },
  {
    path: 'services/api/internal/storage/postgres.go',
    lines: 128,
    imports: ['services/api/internal/config/config.go'],
    externals: ['database/sql', 'github.com/jackc/pgx'],
    symbols: [{ name: 'OpenPostgres', kind: 'function', line: 26 }],
  },
  {
    path: 'services/api/internal/storage/project_store.go',
    lines: 186,
    imports: ['services/api/internal/storage/postgres.go', 'services/api/internal/model/project.go'],
    externals: ['context', 'database/sql'],
    symbols: [{ name: 'PostgresProjectStore', kind: 'class', line: 21, extends: 'ProjectStore' }],
  },
  {
    path: 'services/api/internal/storage/metrics_store.go',
    lines: 154,
    imports: ['services/api/internal/storage/postgres.go', 'services/api/internal/model/metric.go'],
    externals: ['context', 'database/sql'],
    symbols: [{ name: 'PostgresMetricsStore', kind: 'class', line: 19 }],
  },
  { path: 'services/api/internal/model/project.go', lines: 48, symbols: [{ name: 'Project', kind: 'class', line: 9 }] },
  { path: 'services/api/internal/model/metric.go', lines: 38, symbols: [{ name: 'Metric', kind: 'class', line: 8 }] },
  {
    path: 'services/api/internal/config/config.go',
    lines: 86,
    externals: ['encoding/json'],
    symbols: [{ name: 'Config', kind: 'class', line: 14 }],
  },
  { path: 'services/api/go.mod', lines: 24 },

  /* ------------------------------------------ packages/design-system */
  {
    path: 'packages/design-system/src/index.ts',
    lines: 12,
    imports: [
      'packages/design-system/src/Card.tsx',
      'packages/design-system/src/Badge.tsx',
      'packages/design-system/src/Chart.tsx',
      'packages/design-system/src/Sidebar.tsx',
      'packages/design-system/src/TopBar.tsx',
    ],
  },
  {
    path: 'packages/design-system/src/Card.tsx',
    lines: 68,
    imports: ['packages/design-system/src/tokens.ts'],
    externals: ['react', 'clsx'],
    symbols: [{ name: 'Card', kind: 'function', line: 14 }],
  },
  {
    path: 'packages/design-system/src/Badge.tsx',
    lines: 54,
    imports: ['packages/design-system/src/tokens.ts'],
    externals: ['react', 'clsx'],
    symbols: [{ name: 'Badge', kind: 'function', line: 11 }],
  },
  {
    path: 'packages/design-system/src/Chart.tsx',
    lines: 214,
    imports: ['packages/design-system/src/tokens.ts'],
    externals: ['react'],
    symbols: [{ name: 'Chart', kind: 'function', line: 38 }],
  },
  {
    path: 'packages/design-system/src/Sidebar.tsx',
    lines: 132,
    imports: ['packages/design-system/src/tokens.ts', 'packages/design-system/src/Badge.tsx'],
    externals: ['react', 'clsx'],
    symbols: [{ name: 'Sidebar', kind: 'function', line: 21 }],
  },
  {
    path: 'packages/design-system/src/TopBar.tsx',
    lines: 104,
    imports: ['packages/design-system/src/tokens.ts'],
    externals: ['react'],
    symbols: [{ name: 'TopBar', kind: 'function', line: 18 }],
  },
  { path: 'packages/design-system/src/tokens.ts', lines: 96, symbols: [{ name: 'tokens', kind: 'function', line: 12 }] },
  {
    path: 'packages/design-system/src/Card.test.tsx',
    lines: 44,
    imports: ['packages/design-system/src/Card.tsx'],
    externals: ['vitest', 'react'],
  },
  { path: 'packages/design-system/package.json', lines: 34 },

  /* ---------------------------------------------- packages/core-sdk */
  {
    path: 'packages/core-sdk/src/index.ts',
    lines: 10,
    imports: ['packages/core-sdk/src/client.ts', 'packages/core-sdk/src/types.ts', 'packages/core-sdk/src/errors.ts'],
  },
  {
    path: 'packages/core-sdk/src/client.ts',
    lines: 246,
    imports: ['packages/core-sdk/src/types.ts', 'packages/core-sdk/src/errors.ts', 'packages/core-sdk/src/retry.ts'],
    externals: ['zod'],
    symbols: [
      { name: 'HelioClient', kind: 'class', line: 34 },
      { name: 'ClientOptions', kind: 'interface', line: 18 },
    ],
  },
  {
    path: 'packages/core-sdk/src/types.ts',
    lines: 128,
    externals: ['zod'],
    symbols: [
      { name: 'Project', kind: 'interface', line: 11 },
      { name: 'Metric', kind: 'interface', line: 42 },
    ],
  },
  {
    path: 'packages/core-sdk/src/errors.ts',
    lines: 62,
    symbols: [
      { name: 'HelioError', kind: 'class', line: 8 },
      { name: 'RateLimitError', kind: 'class', line: 34, extends: 'HelioError' },
    ],
  },
  {
    path: 'packages/core-sdk/src/retry.ts',
    lines: 74,
    imports: ['packages/core-sdk/src/errors.ts'],
    symbols: [{ name: 'withRetry', kind: 'function', line: 16 }],
  },
  {
    path: 'packages/core-sdk/src/client.test.ts',
    lines: 168,
    imports: ['packages/core-sdk/src/client.ts', 'packages/core-sdk/src/errors.ts'],
    externals: ['vitest'],
  },
  {
    path: 'packages/core-sdk/src/retry.test.ts',
    lines: 82,
    imports: ['packages/core-sdk/src/retry.ts'],
    externals: ['vitest'],
  },
  { path: 'packages/core-sdk/package.json', lines: 30 },

  /* -------------------------------------------------------------- infra */
  { path: 'infra/docker-compose.yml', lines: 58 },
  { path: 'infra/Dockerfile', lines: 34 },
  { path: 'infra/k8s/api-deployment.yaml', lines: 92 },
  { path: 'infra/k8s/web-deployment.yaml', lines: 78 },

  /* --------------------------------------------------------------- root */
  { path: 'package.json', lines: 46 },
  { path: 'tsconfig.json', lines: 28 },
  { path: 'README.md', lines: 120 },
];

const BYTES_PER_LINE = 38;

function nodeTypeFor(path: string): NodeType {
  if (isTestFile(path)) return 'test';
  if (isConfigFile(path)) return 'config';
  return 'file';
}

/** Builds the demo graph. Pure and deterministic — same output every call. */
export function createDemoGraph(): RepositoryGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  const add = (node: GraphNode) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };

  const link = (edge: GraphEdge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    edges.push(edge);
  };

  add({
    id: 'repo',
    type: 'repository',
    name: 'helio',
    path: '',
    parentId: null,
    moduleId: null,
    language: 'typescript',
    metadata: { depth: 0, sourceAvailability: 'not-fetched' },
  });

  /* Directories */
  const directories = new Set<string>();
  for (const file of FILES) {
    const segments = file.path.split('/');
    for (let i = 1; i < segments.length; i += 1) directories.add(segments.slice(0, i).join('/'));
  }
  const packageDirs = new Set(
    FILES.filter((file) => /\/(package\.json|go\.mod|build\.gradle\.kts)$/.test(file.path)).map((file) =>
      file.path.slice(0, file.path.lastIndexOf('/')),
    ),
  );

  for (const path of [...directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
    const segments = path.split('/');
    const parent = segments.slice(0, -1).join('/');
    add({
      id: `dir:${path}`,
      type: segments.length === 1 ? 'module' : packageDirs.has(path) ? 'package' : 'directory',
      name: segments[segments.length - 1],
      path,
      parentId: parent ? `dir:${parent}` : 'repo',
      moduleId: `dir:${segments[0]}`,
      language: null,
      metadata: {
        depth: segments.length,
        sourceAvailability: 'not-fetched',
        descendantFileCount: 0,
        descendantByteSize: 0,
        languageMix: {},
      },
    });
  }

  /* Files */
  for (const file of FILES) {
    const segments = file.path.split('/');
    const parent = segments.slice(0, -1).join('/');
    const language = detectLanguage(file.path);
    const symbols: SymbolRef[] | undefined = file.symbols?.map((symbol) => ({
      name: symbol.name,
      kind: symbol.kind,
      line: symbol.line,
    }));

    add({
      id: `file:${file.path}`,
      type: nodeTypeFor(file.path),
      name: segments[segments.length - 1],
      path: file.path,
      parentId: parent ? `dir:${parent}` : 'repo',
      moduleId: segments.length > 1 ? `dir:${segments[0]}` : 'repo',
      language: language?.id ?? null,
      metadata: {
        depth: segments.length,
        lineCount: file.lines,
        byteSize: file.lines * BYTES_PER_LINE,
        importCount: (file.imports?.length ?? 0) + (file.externals?.length ?? 0),
        symbols,
        isTest: isTestFile(file.path),
        isConfig: isConfigFile(file.path),
        sourceAvailability: 'unavailable',
      },
    });
  }

  /* Symbols */
  const symbolIdByName = new Map<string, string>();
  for (const file of FILES) {
    if (!file.symbols) continue;
    for (const symbol of file.symbols) {
      const id = `sym:${file.path}#${symbol.name}`;
      add({
        id,
        type: symbol.kind,
        name: symbol.name,
        path: `${file.path}:${symbol.line}`,
        parentId: `file:${file.path}`,
        moduleId: `dir:${file.path.split('/')[0]}`,
        language: detectLanguage(file.path)?.id ?? null,
        metadata: { depth: file.path.split('/').length + 1, sourceAvailability: 'unavailable' },
      });
      link({ id: `declares:${file.path}:${symbol.name}`, source: `file:${file.path}`, target: id, type: 'declares', direction: 'directed' });
      if (!symbolIdByName.has(symbol.name)) symbolIdByName.set(symbol.name, id);
    }
  }

  /* External packages */
  const externalImporters = new Map<string, Set<string>>();
  for (const file of FILES) {
    for (const external of file.externals ?? []) {
      const bucket = externalImporters.get(external) ?? new Set<string>();
      bucket.add(file.path);
      externalImporters.set(external, bucket);
    }
  }
  for (const [name, importers] of externalImporters) {
    const ecosystem = EXTERNALS[name] ?? 'npm';
    const id = `ext:${ecosystem}:${name}`;
    add({
      id,
      type: 'external',
      name,
      path: name,
      parentId: null,
      moduleId: null,
      language: null,
      metadata: { depth: 1, ecosystem, sourceAvailability: 'unavailable' },
    });
    for (const importer of importers) {
      link({
        id: `ext:${importer}:${id}`,
        source: `file:${importer}`,
        target: id,
        type: 'external-dependency',
        direction: 'directed',
        metadata: { confidence: 'resolved' },
      });
    }
  }

  /* Hierarchy */
  for (const node of nodes) {
    if (!node.parentId) continue;
    if (node.type === 'class' || node.type === 'interface' || node.type === 'function') continue;
    link({ id: `contains:${node.parentId}:${node.id}`, source: node.parentId, target: node.id, type: 'contains', direction: 'directed' });
  }

  /* Imports */
  for (const file of FILES) {
    for (const target of file.imports ?? []) {
      link({
        id: `import:${file.path}:${target}`,
        source: `file:${file.path}`,
        target: `file:${target}`,
        type: 'import',
        direction: 'directed',
        metadata: { specifier: relativeSpecifier(file.path, target), confidence: 'resolved' },
      });
    }
  }

  /* Inheritance */
  for (const file of FILES) {
    for (const symbol of file.symbols ?? []) {
      if (!symbol.extends) continue;
      const targetId = symbolIdByName.get(symbol.extends);
      if (!targetId) continue;
      const targetNode = nodes.find((node) => node.id === targetId);
      link({
        id: `inherit:${file.path}:${symbol.name}`,
        source: `sym:${file.path}#${symbol.name}`,
        target: targetId,
        type: targetNode?.type === 'interface' ? 'implements' : 'extends',
        direction: 'directed',
        metadata: { specifier: symbol.extends, confidence: 'heuristic' },
      });
    }
  }

  /* Test → source */
  for (const file of FILES) {
    if (!isTestFile(file.path)) continue;
    const base = file.path.slice(file.path.lastIndexOf('/') + 1);
    const extension = base.slice(base.lastIndexOf('.'));
    const stem = base.replace(/\.[^.]+$/, '').replace(/[._-]?(test|spec)s?$/i, '').replace(/(Test|Tests)$/, '');
    const candidates = FILES.filter((candidate) => {
      if (candidate.path === file.path) return false;
      const candidateBase = candidate.path.slice(candidate.path.lastIndexOf('/') + 1);
      return candidateBase === `${stem}${extension}` || candidateBase === `${stem}.kt` || candidateBase === `${stem}.tsx`;
    });
    if (candidates.length !== 1) continue;
    link({
      id: `test:${file.path}`,
      source: `file:${file.path}`,
      target: `file:${candidates[0].path}`,
      type: 'test-of',
      direction: 'directed',
      metadata: { confidence: 'heuristic' },
    });
  }

  /* Module-level aggregation */
  const moduleWeights = new Map<string, number>();
  for (const file of FILES) {
    const fromModule = file.path.split('/')[0];
    for (const target of file.imports ?? []) {
      const toModule = target.split('/')[0];
      if (fromModule === toModule) continue;
      const key = `${fromModule}→${toModule}`;
      moduleWeights.set(key, (moduleWeights.get(key) ?? 0) + 1);
    }
  }
  for (const [key, weight] of moduleWeights) {
    const [from, to] = key.split('→');
    link({
      id: `moddep:${from}:${to}`,
      source: `dir:${from}`,
      target: `dir:${to}`,
      type: 'module-dependency',
      direction: 'directed',
      metadata: { weight, confidence: 'resolved' },
    });
  }

  annotateDerivedCounts(nodes, edges);

  const languageStats = computeLanguageStats();
  const fileNodes = nodes.filter((node) => node.type === 'file' || node.type === 'test' || node.type === 'config');

  return {
    repository: {
      owner: 'repoverse',
      name: 'helio',
      fullName: 'repoverse/helio',
      url: '',
      branch: 'main',
      defaultBranch: 'main',
      description: 'A synthetic polyglot product repository, authored for this demo.',
      primaryLanguage: 'TypeScript',
      languages: { TypeScript: 412_000, Kotlin: 186_000, Go: 224_000 },
      stars: null,
      sizeKb: null,
      commit: null,
      isDemo: true,
    },
    nodes,
    edges,
    metadata: {
      analyzedAt: new Date().toISOString(),
      durationMs: 0,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      fileCount: fileNodes.length,
      directoryCount: directories.size,
      externalDependencyCount: externalImporters.size,
      testFileCount: fileNodes.filter((node) => node.metadata.isTest).length,
      configFileCount: fileNodes.filter((node) => node.metadata.isConfig).length,
      parsedFileCount: FILES.length,
      skippedFileCount: 0,
      totalTreeEntries: FILES.length,
      truncated: false,
      languageStats,
      symbolExtraction: true,
    },
    analysisStatus: 'complete',
    warnings: [],
  };
}

function computeLanguageStats(): LanguageStat[] {
  const stats = new Map<string, LanguageStat>();
  for (const file of FILES) {
    const language = detectLanguage(file.path);
    if (!language) continue;
    const entry = stats.get(language.id) ?? { language: language.id, files: 0, lines: 0 };
    entry.files += 1;
    entry.lines += file.lines;
    stats.set(language.id, entry);
  }
  return [...stats.values()].sort((a, b) => b.files - a.files);
}

function relativeSpecifier(from: string, to: string): string {
  const fromSegments = from.split('/').slice(0, -1);
  const toSegments = to.split('/');
  let shared = 0;
  while (shared < fromSegments.length && fromSegments[shared] === toSegments[shared]) shared += 1;
  const up = fromSegments.length - shared;
  const prefix = up === 0 ? './' : '../'.repeat(up);
  return `${prefix}${toSegments.slice(shared).join('/')}`.replace(/\.(tsx?|kt|go)$/, '');
}
