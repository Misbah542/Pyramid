/**
 * Import resolution: turns a raw import specifier into either a path inside the
 * repository or a third-party package.
 *
 * Resolution is best effort by design. Anything that required guesswork is
 * flagged `heuristic`, and the UI labels those edges as inferred rather than
 * presenting them as facts.
 */

import { detectLanguage } from '@shared/language';
import type { EdgeConfidence } from '@shared/graph';

export type Resolution =
  | { kind: 'file'; path: string; confidence: EdgeConfidence }
  | { kind: 'directory'; path: string; confidence: EdgeConfidence }
  | { kind: 'external'; name: string; ecosystem: string };

export interface RepoFileIndex {
  files: ReadonlySet<string>;
  directories: ReadonlySet<string>;
  /** basename → every path with that basename. */
  byBasename: ReadonlyMap<string, string[]>;
  /** Path without its extension → path. `src/a/b` → `src/a/b.ts` */
  byExtensionlessPath: ReadonlyMap<string, string[]>;
  /** JVM-style dotted type name → file path. `com.acme.Foo` → `.../com/acme/Foo.kt` */
  byDottedName: ReadonlyMap<string, string>;
  /** Go module path from go.mod, when present. */
  goModule: string | null;
  /** Dart/Flutter package name from pubspec.yaml. */
  dartPackage: string | null;
  /** Path-alias prefixes declared in tsconfig/jsconfig, e.g. `@/` → `src/`. */
  aliases: ReadonlyArray<{ prefix: string; targets: string[] }>;
}

const JS_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte', 'json'];
const JS_INDEX_FILES = JS_EXTENSIONS.map((ext) => `index.${ext}`);

const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'crypto', 'dns', 'events', 'fs', 'http',
  'http2', 'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'querystring', 'readline',
  'stream', 'string_decoder', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
]);

const PYTHON_STDLIB = new Set([
  'abc', 'argparse', 'asyncio', 'base64', 'collections', 'contextlib', 'copy', 'csv', 'dataclasses',
  'datetime', 'enum', 'functools', 'glob', 'hashlib', 'http', 'importlib', 'inspect', 'io', 'itertools',
  'json', 'logging', 'math', 'os', 'pathlib', 'pickle', 'random', 're', 'shutil', 'socket', 'string',
  'subprocess', 'sys', 'tempfile', 'threading', 'time', 'traceback', 'typing', 'unittest', 'urllib',
  'uuid', 'warnings', 'weakref',
]);

const RUST_STDLIB = new Set(['std', 'core', 'alloc', 'proc_macro', 'test']);

const JVM_STDLIB_PREFIXES = ['java.', 'javax.', 'jdk.', 'sun.', 'kotlin.', 'kotlinx.coroutines', 'scala.'];

function dirnameOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function normalise(path: string): string | null {
  const parts: string[] = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join('/');
}

function join(base: string, relative: string): string | null {
  return normalise(base ? `${base}/${relative}` : relative);
}

/** Tries `candidate` as-is, then with each extension, then as a directory index. */
function resolveWithExtensions(
  index: RepoFileIndex,
  candidate: string,
  extensions: string[],
  indexFiles: string[],
): string | null {
  if (index.files.has(candidate)) return candidate;
  for (const ext of extensions) {
    const withExt = `${candidate}.${ext}`;
    if (index.files.has(withExt)) return withExt;
  }
  for (const indexFile of indexFiles) {
    const nested = `${candidate}/${indexFile}`;
    if (index.files.has(nested)) return nested;
  }
  return null;
}

function externalNpm(specifier: string): Resolution {
  const clean = specifier.replace(/^node:/, '');
  if (specifier.startsWith('node:') || NODE_BUILTINS.has(clean.split('/')[0])) {
    return { kind: 'external', name: clean.split('/')[0], ecosystem: 'node' };
  }
  const parts = clean.split('/');
  const name = clean.startsWith('@') && parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
  return { kind: 'external', name, ecosystem: 'npm' };
}

function resolveJs(index: RepoFileIndex, fromPath: string, specifier: string): Resolution | null {
  if (specifier.startsWith('.')) {
    const candidate = join(dirnameOf(fromPath), specifier);
    if (candidate === null) return null;
    const hit = resolveWithExtensions(index, candidate, JS_EXTENSIONS, JS_INDEX_FILES);
    return hit ? { kind: 'file', path: hit, confidence: 'resolved' } : null;
  }

  for (const alias of index.aliases) {
    if (!specifier.startsWith(alias.prefix)) continue;
    const rest = specifier.slice(alias.prefix.length);
    for (const target of alias.targets) {
      const candidate = normalise(`${target}/${rest}`);
      if (candidate === null) continue;
      const hit = resolveWithExtensions(index, candidate, JS_EXTENSIONS, JS_INDEX_FILES);
      if (hit) return { kind: 'file', path: hit, confidence: 'resolved' };
    }
  }

  // Monorepo-style absolute-ish specifiers ("src/lib/x", "app/components/y").
  if (!specifier.startsWith('@') && specifier.includes('/')) {
    const hit = resolveWithExtensions(index, specifier, JS_EXTENSIONS, JS_INDEX_FILES);
    if (hit) return { kind: 'file', path: hit, confidence: 'heuristic' };
  }

  return externalNpm(specifier);
}

function resolvePython(index: RepoFileIndex, fromPath: string, specifier: string): Resolution | null {
  const leadingDots = /^\.+/.exec(specifier)?.[0].length ?? 0;

  if (leadingDots > 0) {
    let base = dirnameOf(fromPath);
    for (let i = 1; i < leadingDots; i += 1) base = dirnameOf(base);
    const rest = specifier.slice(leadingDots).replace(/\./g, '/');
    const candidate = rest ? join(base, rest) : base;
    if (candidate === null) return null;
    const hit = resolveWithExtensions(index, candidate, ['py', 'pyi'], ['__init__.py']);
    if (hit) return { kind: 'file', path: hit, confidence: 'resolved' };
    return index.directories.has(candidate) ? { kind: 'directory', path: candidate, confidence: 'resolved' } : null;
  }

  const asPath = specifier.replace(/\./g, '/');
  for (const prefix of ['', 'src/', 'lib/', 'app/']) {
    const candidate = normalise(`${prefix}${asPath}`);
    if (candidate === null) continue;
    const hit = resolveWithExtensions(index, candidate, ['py', 'pyi'], ['__init__.py']);
    if (hit) return { kind: 'file', path: hit, confidence: prefix ? 'heuristic' : 'resolved' };
  }

  const root = specifier.split('.')[0];
  if (PYTHON_STDLIB.has(root)) return { kind: 'external', name: root, ecosystem: 'python' };
  return { kind: 'external', name: root, ecosystem: 'pypi' };
}

function resolveGo(index: RepoFileIndex, specifier: string): Resolution | null {
  if (index.goModule && (specifier === index.goModule || specifier.startsWith(`${index.goModule}/`))) {
    const rest = specifier.slice(index.goModule.length).replace(/^\//, '');
    const candidate = normalise(rest);
    if (candidate !== null && index.directories.has(candidate)) {
      return { kind: 'directory', path: candidate, confidence: 'resolved' };
    }
  }
  const head = specifier.split('/')[0];
  if (!head.includes('.')) return { kind: 'external', name: specifier, ecosystem: 'go-std' };
  return { kind: 'external', name: specifier.split('/').slice(0, 3).join('/'), ecosystem: 'go' };
}

function resolveJvm(index: RepoFileIndex, specifier: string): Resolution | null {
  const dotted = specifier.replace(/\.\*$/, '');
  const direct = index.byDottedName.get(dotted);
  if (direct) return { kind: 'file', path: direct, confidence: 'resolved' };

  // `com.acme.Foo.CONSTANT` → the type is one segment up.
  const segments = dotted.split('.');
  if (segments.length > 2) {
    const parent = index.byDottedName.get(segments.slice(0, -1).join('.'));
    if (parent) return { kind: 'file', path: parent, confidence: 'heuristic' };
  }

  if (JVM_STDLIB_PREFIXES.some((prefix) => dotted.startsWith(prefix))) {
    return { kind: 'external', name: segments.slice(0, 2).join('.'), ecosystem: 'jdk' };
  }

  const depth = ['com', 'org', 'io', 'net', 'dev', 'me'].includes(segments[0]) ? 3 : 2;
  return { kind: 'external', name: segments.slice(0, depth).join('.'), ecosystem: 'maven' };
}

function resolveRust(index: RepoFileIndex, fromPath: string, specifier: string): Resolution | null {
  const segments = specifier.split('::').filter(Boolean);
  if (segments.length === 0) return null;
  const head = segments[0];

  if (head === 'crate' || head === 'self' || head === 'super') {
    let base = head === 'crate' ? 'src' : dirnameOf(fromPath);
    if (head === 'super') base = dirnameOf(base);
    const rest = segments.slice(1);
    for (let take = rest.length; take > 0; take -= 1) {
      const candidate = join(base, rest.slice(0, take).join('/'));
      if (candidate === null) continue;
      const hit = resolveWithExtensions(index, candidate, ['rs'], ['mod.rs']);
      if (hit) return { kind: 'file', path: hit, confidence: take === rest.length ? 'resolved' : 'heuristic' };
    }
    return null;
  }

  if (RUST_STDLIB.has(head)) return { kind: 'external', name: head, ecosystem: 'rust-std' };
  return { kind: 'external', name: head, ecosystem: 'crates' };
}

function resolveDart(index: RepoFileIndex, fromPath: string, specifier: string): Resolution | null {
  if (specifier.startsWith('dart:')) {
    return { kind: 'external', name: specifier, ecosystem: 'dart-sdk' };
  }
  if (specifier.startsWith('package:')) {
    const rest = specifier.slice('package:'.length);
    const [pkg, ...tail] = rest.split('/');
    if (index.dartPackage && pkg === index.dartPackage) {
      const candidate = normalise(`lib/${tail.join('/')}`);
      if (candidate && index.files.has(candidate)) {
        return { kind: 'file', path: candidate, confidence: 'resolved' };
      }
    }
    return { kind: 'external', name: pkg, ecosystem: 'pub' };
  }
  const candidate = join(dirnameOf(fromPath), specifier);
  if (candidate === null) return null;
  return index.files.has(candidate) ? { kind: 'file', path: candidate, confidence: 'resolved' } : null;
}

function resolveC(index: RepoFileIndex, fromPath: string, specifier: string): Resolution | null {
  const relative = join(dirnameOf(fromPath), specifier);
  if (relative && index.files.has(relative)) return { kind: 'file', path: relative, confidence: 'resolved' };
  if (index.files.has(specifier)) return { kind: 'file', path: specifier, confidence: 'resolved' };
  const unique = uniqueByBasename(index, specifier.split('/').pop() ?? specifier);
  if (unique) return { kind: 'file', path: unique, confidence: 'heuristic' };
  return { kind: 'external', name: specifier, ecosystem: 'system' };
}

function resolveRuby(index: RepoFileIndex, fromPath: string, specifier: string): Resolution | null {
  const relative = join(dirnameOf(fromPath), specifier);
  if (relative) {
    const hit = resolveWithExtensions(index, relative, ['rb'], []);
    if (hit) return { kind: 'file', path: hit, confidence: 'resolved' };
  }
  for (const prefix of ['lib/', 'app/', '']) {
    const candidate = normalise(`${prefix}${specifier}`);
    if (!candidate) continue;
    const hit = resolveWithExtensions(index, candidate, ['rb'], []);
    if (hit) return { kind: 'file', path: hit, confidence: 'heuristic' };
  }
  return { kind: 'external', name: specifier.split('/')[0], ecosystem: 'rubygems' };
}

function uniqueByBasename(index: RepoFileIndex, basename: string): string | null {
  const matches = index.byBasename.get(basename);
  return matches && matches.length === 1 ? matches[0] : null;
}

function resolveByTypeName(index: RepoFileIndex, name: string, extensions: string[]): Resolution | null {
  for (const ext of extensions) {
    const unique = uniqueByBasename(index, `${name}.${ext}`);
    if (unique) return { kind: 'file', path: unique, confidence: 'heuristic' };
  }
  return null;
}

/**
 * Resolve one import specifier found in `fromPath`.
 * Returns null when the specifier cannot be classified at all.
 */
export function resolveImport(index: RepoFileIndex, fromPath: string, specifier: string): Resolution | null {
  const language = detectLanguage(fromPath);
  if (!language) return null;

  switch (language.id) {
    case 'typescript':
    case 'javascript':
    case 'vue':
    case 'svelte':
      return resolveJs(index, fromPath, specifier);
    case 'python':
      return resolvePython(index, fromPath, specifier);
    case 'go':
      return resolveGo(index, specifier);
    case 'java':
    case 'kotlin':
    case 'scala':
      return resolveJvm(index, specifier);
    case 'rust':
      return resolveRust(index, fromPath, specifier);
    case 'dart':
      return resolveDart(index, fromPath, specifier);
    case 'c':
    case 'cpp':
      return resolveC(index, fromPath, specifier);
    case 'ruby':
      return resolveRuby(index, fromPath, specifier);
    case 'swift': {
      const internal = resolveByTypeName(index, specifier, ['swift']);
      return internal ?? { kind: 'external', name: specifier, ecosystem: 'spm' };
    }
    case 'php': {
      const typeName = specifier.split('/').pop() ?? specifier;
      const internal = resolveByTypeName(index, typeName, ['php']);
      return internal ?? { kind: 'external', name: specifier.split('/').slice(0, 2).join('\\'), ecosystem: 'packagist' };
    }
    case 'csharp': {
      const typeName = specifier.split('.').pop() ?? specifier;
      const internal = resolveByTypeName(index, typeName, ['cs']);
      return internal ?? { kind: 'external', name: specifier.split('.').slice(0, 2).join('.'), ecosystem: 'nuget' };
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Index construction
 * ------------------------------------------------------------------ */

const JVM_SOURCE_ROOTS = [
  'src/main/java/',
  'src/main/kotlin/',
  'src/test/java/',
  'src/test/kotlin/',
  'src/androidTest/java/',
  'src/androidTest/kotlin/',
  'src/commonMain/kotlin/',
  'src/jvmMain/kotlin/',
  'src/',
  'java/',
  'kotlin/',
  'scala/',
];

export interface IndexInput {
  files: string[];
  directories: string[];
  /** Raw contents of manifests we know how to read, keyed by path. */
  manifests: Map<string, string>;
}

export function buildFileIndex({ files, directories, manifests }: IndexInput): RepoFileIndex {
  const byBasename = new Map<string, string[]>();
  const byExtensionlessPath = new Map<string, string[]>();
  const byDottedName = new Map<string, string>();

  for (const path of files) {
    const basename = path.slice(path.lastIndexOf('/') + 1);
    const basenameBucket = byBasename.get(basename);
    if (basenameBucket) basenameBucket.push(path);
    else byBasename.set(basename, [path]);

    const dot = path.lastIndexOf('.');
    if (dot > path.lastIndexOf('/')) {
      const stem = path.slice(0, dot);
      const stemBucket = byExtensionlessPath.get(stem);
      if (stemBucket) stemBucket.push(path);
      else byExtensionlessPath.set(stem, [path]);

      const language = detectLanguage(path);
      if (language && ['java', 'kotlin', 'scala'].includes(language.id)) {
        const root = JVM_SOURCE_ROOTS.find((candidate) => stem.includes(candidate));
        const relative = root ? stem.slice(stem.indexOf(root) + root.length) : stem;
        const dotted = relative.replace(/\//g, '.');
        if (!byDottedName.has(dotted)) byDottedName.set(dotted, path);
      }
    }
  }

  return {
    files: new Set(files),
    directories: new Set(directories),
    byBasename,
    byExtensionlessPath,
    byDottedName,
    goModule: readGoModule(manifests),
    dartPackage: readDartPackage(manifests),
    aliases: readTsAliases(manifests),
  };
}

function readGoModule(manifests: Map<string, string>): string | null {
  const content = manifests.get('go.mod');
  if (!content) return null;
  const match = /^\s*module\s+(\S+)/m.exec(content);
  return match ? match[1] : null;
}

function readDartPackage(manifests: Map<string, string>): string | null {
  const content = manifests.get('pubspec.yaml');
  if (!content) return null;
  const match = /^name:\s*([\w-]+)/m.exec(content);
  return match ? match[1] : null;
}

/** Reads `compilerOptions.paths` out of tsconfig/jsconfig without a JSON parse. */
function readTsAliases(manifests: Map<string, string>): Array<{ prefix: string; targets: string[] }> {
  const aliases: Array<{ prefix: string; targets: string[] }> = [];
  for (const [path, content] of manifests) {
    if (!/(tsconfig|jsconfig)[\w.-]*\.json$/.test(path)) continue;
    const baseDir = dirnameOf(path);
    const pathsBlock = /"paths"\s*:\s*\{([\s\S]*?)\n\s*\}/.exec(content);
    if (!pathsBlock) continue;
    const entryRe = /"([^"]+)"\s*:\s*\[([^\]]*)\]/g;
    for (const entry of pathsBlock[1].matchAll(entryRe)) {
      const prefix = entry[1].replace(/\*$/, '');
      const targets = [...entry[2].matchAll(/"([^"]+)"/g)]
        .map((m) => m[1].replace(/\*$/, '').replace(/^\.\//, ''))
        .map((target) => normalise(baseDir ? `${baseDir}/${target}` : target))
        .filter((target): target is string => target !== null);
      if (prefix && targets.length) aliases.push({ prefix, targets });
    }
  }
  // Common conventions, applied only if the project did not declare its own.
  if (!aliases.some((alias) => alias.prefix === '@/')) {
    aliases.push({ prefix: '@/', targets: ['src', 'app', '.'] });
  }
  if (!aliases.some((alias) => alias.prefix === '~/')) {
    aliases.push({ prefix: '~/', targets: ['src', 'app', '.'] });
  }
  return aliases;
}
