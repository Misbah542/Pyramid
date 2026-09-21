/**
 * File classification: language detection, and the test / config / vendored
 * conventions the analyser and the UI both rely on.
 */

export interface LanguageDef {
  id: string;
  label: string;
  /** Extensions, without the leading dot. */
  extensions: string[];
  /** Package ecosystem used when resolving third-party imports. */
  ecosystem?: string;
  /** Whether the import parser can produce dependency edges for this language. */
  parsable: boolean;
}

export const LANGUAGES: LanguageDef[] = [
  { id: 'typescript', label: 'TypeScript', extensions: ['ts', 'tsx', 'mts', 'cts'], ecosystem: 'npm', parsable: true },
  { id: 'javascript', label: 'JavaScript', extensions: ['js', 'jsx', 'mjs', 'cjs'], ecosystem: 'npm', parsable: true },
  { id: 'python', label: 'Python', extensions: ['py', 'pyi'], ecosystem: 'pypi', parsable: true },
  { id: 'go', label: 'Go', extensions: ['go'], ecosystem: 'go', parsable: true },
  { id: 'java', label: 'Java', extensions: ['java'], ecosystem: 'maven', parsable: true },
  { id: 'kotlin', label: 'Kotlin', extensions: ['kt', 'kts'], ecosystem: 'maven', parsable: true },
  { id: 'swift', label: 'Swift', extensions: ['swift'], ecosystem: 'spm', parsable: true },
  { id: 'rust', label: 'Rust', extensions: ['rs'], ecosystem: 'crates', parsable: true },
  { id: 'ruby', label: 'Ruby', extensions: ['rb'], ecosystem: 'rubygems', parsable: true },
  { id: 'php', label: 'PHP', extensions: ['php'], ecosystem: 'packagist', parsable: true },
  { id: 'csharp', label: 'C#', extensions: ['cs'], ecosystem: 'nuget', parsable: true },
  { id: 'c', label: 'C', extensions: ['c', 'h'], parsable: true },
  { id: 'cpp', label: 'C++', extensions: ['cc', 'cpp', 'cxx', 'hpp', 'hh'], parsable: true },
  { id: 'dart', label: 'Dart', extensions: ['dart'], ecosystem: 'pub', parsable: true },
  { id: 'scala', label: 'Scala', extensions: ['scala'], ecosystem: 'maven', parsable: true },
  { id: 'objc', label: 'Objective-C', extensions: ['m', 'mm'], parsable: false },
  { id: 'shell', label: 'Shell', extensions: ['sh', 'bash', 'zsh'], parsable: false },
  { id: 'sql', label: 'SQL', extensions: ['sql'], parsable: false },
  { id: 'html', label: 'HTML', extensions: ['html', 'htm'], parsable: false },
  { id: 'css', label: 'CSS', extensions: ['css', 'scss', 'sass', 'less'], parsable: false },
  { id: 'vue', label: 'Vue', extensions: ['vue'], ecosystem: 'npm', parsable: true },
  { id: 'svelte', label: 'Svelte', extensions: ['svelte'], ecosystem: 'npm', parsable: true },
  { id: 'markdown', label: 'Markdown', extensions: ['md', 'mdx'], parsable: false },
  { id: 'json', label: 'JSON', extensions: ['json', 'jsonc'], parsable: false },
  { id: 'yaml', label: 'YAML', extensions: ['yml', 'yaml'], parsable: false },
  { id: 'toml', label: 'TOML', extensions: ['toml'], parsable: false },
  { id: 'xml', label: 'XML', extensions: ['xml'], parsable: false },
  { id: 'gradle', label: 'Gradle', extensions: ['gradle'], parsable: false },
  { id: 'proto', label: 'Protobuf', extensions: ['proto'], parsable: false },
  { id: 'graphql', label: 'GraphQL', extensions: ['graphql', 'gql'], parsable: false },
];

const BY_EXTENSION = new Map<string, LanguageDef>();
for (const lang of LANGUAGES) {
  for (const ext of lang.extensions) BY_EXTENSION.set(ext, lang);
}

const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));

export function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function detectLanguage(path: string): LanguageDef | null {
  return BY_EXTENSION.get(extensionOf(path)) ?? null;
}

export function languageLabel(id: string | null | undefined): string {
  if (!id) return 'Unknown';
  return BY_ID.get(id)?.label ?? id;
}

export function isParsable(path: string): boolean {
  return detectLanguage(path)?.parsable ?? false;
}

/** Source files worth turning into nodes, even when we cannot parse imports. */
export function isSourceLike(path: string): boolean {
  const lang = detectLanguage(path);
  if (!lang) return false;
  return !['markdown', 'json', 'yaml', 'toml', 'xml'].includes(lang.id) || isConfigFile(path);
}

const CONFIG_BASENAMES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'tsconfig.json',
  'jsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'webpack.config.js',
  'rollup.config.js',
  'babel.config.js',
  '.babelrc',
  'next.config.js',
  'next.config.mjs',
  'tailwind.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'eslint.config.js',
  '.eslintrc.json',
  '.prettierrc',
  'dockerfile',
  'docker-compose.yml',
  'makefile',
  'cargo.toml',
  'cargo.lock',
  'go.mod',
  'go.sum',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'requirements.txt',
  'pipfile',
  'poetry.lock',
  'gemfile',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'pom.xml',
  'composer.json',
  'pubspec.yaml',
  'package.swift',
  'cmakelists.txt',
]);

export function isConfigFile(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  if (CONFIG_BASENAMES.has(base)) return true;
  if (base.startsWith('.env')) return true;
  if (/^\.(gitignore|dockerignore|editorconfig|nvmrc)$/.test(base)) return true;
  return /\.(gradle|properties)$/.test(base) && !path.includes('/src/');
}

const TEST_DIR_RE = /(^|\/)(tests?|__tests__|spec|specs|testing|e2e|androidTest|test-utils)(\/|$)/i;
const TEST_FILE_RE = /(\.|_|-)(test|spec)s?\.[a-z]+$|^test_.+\.py$|(Test|Tests|Spec)\.(java|kt|kts|swift|cs|scala)$/;

export function isTestFile(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return TEST_DIR_RE.test(path) || TEST_FILE_RE.test(base);
}

/** Directories that add noise rather than architecture. */
const IGNORED_DIR_RE =
  /(^|\/)(node_modules|vendor|third_party|bower_components|dist|build|out|target|bin|obj|\.git|\.github\/workflows\/cache|\.idea|\.vscode|\.gradle|\.next|\.nuxt|\.svelte-kit|__pycache__|\.venv|venv|env|coverage|Pods|DerivedData|\.terraform|generated|gen)(\/|$)/;

const MINIFIED_RE = /\.(min|bundle|chunk)\.(js|css)$/;
const LOCK_RE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock|go\.sum)$/;

export function isIgnoredPath(path: string): boolean {
  return IGNORED_DIR_RE.test(path) || MINIFIED_RE.test(path) || LOCK_RE.test(path);
}

/** Manifests the analyser reads to learn a project's declared dependencies. */
export const MANIFEST_FILES = [
  'package.json',
  'go.mod',
  'Cargo.toml',
  'pyproject.toml',
  'requirements.txt',
  'build.gradle',
  'build.gradle.kts',
  'pom.xml',
  'composer.json',
  'Gemfile',
  'pubspec.yaml',
] as const;
