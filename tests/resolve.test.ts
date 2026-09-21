import { describe, expect, it } from 'vitest';
import { buildFileIndex, resolveImport } from '../server/analysis/resolve';

const index = buildFileIndex({
  files: [
    'package.json',
    'tsconfig.json',
    'src/main.ts',
    'src/app/App.tsx',
    'src/app/routes/index.ts',
    'src/lib/helper.ts',
    'services/api/go.mod',
    'services/api/internal/store/store.go',
    'services/api/cmd/server/main.go',
    'app/src/main/kotlin/com/acme/data/ProfileRepository.kt',
    'app/src/main/kotlin/com/acme/ui/ProfileScreen.kt',
    'pkg/lib.rs',
    'src/lib.rs',
    'src/engine/mod.rs',
    'app/models/user.py',
    'app/services/billing.py',
    'app/__init__.py',
  ],
  directories: [
    'src',
    'src/app',
    'src/app/routes',
    'src/lib',
    'services',
    'services/api',
    'services/api/internal',
    'services/api/internal/store',
    'services/api/cmd',
    'services/api/cmd/server',
    'app',
    'app/models',
    'app/services',
    'pkg',
    'src/engine',
  ],
  manifests: new Map([
    ['tsconfig.json', '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }'],
    ['go.mod', 'module github.com/acme/api\n\ngo 1.22\n'],
  ]),
});

describe('JavaScript / TypeScript resolution', () => {
  it('resolves relative specifiers with an implied extension', () => {
    expect(resolveImport(index, 'src/main.ts', './app/App')).toEqual({
      kind: 'file',
      path: 'src/app/App.tsx',
      confidence: 'resolved',
    });
  });

  it('resolves a directory import to its index file', () => {
    expect(resolveImport(index, 'src/main.ts', './app/routes')).toEqual({
      kind: 'file',
      path: 'src/app/routes/index.ts',
      confidence: 'resolved',
    });
  });

  it('resolves tsconfig path aliases', () => {
    expect(resolveImport(index, 'src/app/App.tsx', '@/lib/helper')).toEqual({
      kind: 'file',
      path: 'src/lib/helper.ts',
      confidence: 'resolved',
    });
  });

  it('classifies bare specifiers as packages, keeping the scope', () => {
    expect(resolveImport(index, 'src/main.ts', 'react-dom/client')).toEqual({
      kind: 'external',
      name: 'react-dom',
      ecosystem: 'npm',
    });
    expect(resolveImport(index, 'src/main.ts', '@tanstack/react-query')).toEqual({
      kind: 'external',
      name: '@tanstack/react-query',
      ecosystem: 'npm',
    });
    expect(resolveImport(index, 'src/main.ts', 'node:fs')).toEqual({
      kind: 'external',
      name: 'fs',
      ecosystem: 'node',
    });
  });

  it('does not escape the repository with ../', () => {
    expect(resolveImport(index, 'src/main.ts', '../../../../etc/passwd')).toBeNull();
  });
});

describe('Python resolution', () => {
  it('resolves absolute package paths', () => {
    expect(resolveImport(index, 'app/services/billing.py', 'app.models.user')).toEqual({
      kind: 'file',
      path: 'app/models/user.py',
      confidence: 'resolved',
    });
  });

  it('resolves relative imports', () => {
    expect(resolveImport(index, 'app/services/billing.py', '..models.user')).toEqual({
      kind: 'file',
      path: 'app/models/user.py',
      confidence: 'resolved',
    });
  });

  it('separates the standard library from third-party packages', () => {
    expect(resolveImport(index, 'app/models/user.py', 'os.path')).toEqual({
      kind: 'external',
      name: 'os',
      ecosystem: 'python',
    });
    expect(resolveImport(index, 'app/models/user.py', 'sqlalchemy.orm')).toEqual({
      kind: 'external',
      name: 'sqlalchemy',
      ecosystem: 'pypi',
    });
  });
});

describe('Go resolution', () => {
  it('maps the module path back to a repository directory', () => {
    expect(resolveImport(index, 'services/api/cmd/server/main.go', 'github.com/acme/api/services/api/internal/store')).toEqual({
      kind: 'directory',
      path: 'services/api/internal/store',
      confidence: 'resolved',
    });
  });

  it('splits standard library from third-party modules', () => {
    expect(resolveImport(index, 'services/api/internal/store/store.go', 'database/sql')).toEqual({
      kind: 'external',
      name: 'database/sql',
      ecosystem: 'go-std',
    });
    expect(resolveImport(index, 'services/api/internal/store/store.go', 'go.uber.org/zap')).toEqual({
      kind: 'external',
      name: 'go.uber.org/zap',
      ecosystem: 'go',
    });
  });
});

describe('JVM resolution', () => {
  it('maps a dotted type name onto a source root', () => {
    expect(resolveImport(index, 'app/src/main/kotlin/com/acme/ui/ProfileScreen.kt', 'com.acme.data.ProfileRepository')).toEqual({
      kind: 'file',
      path: 'app/src/main/kotlin/com/acme/data/ProfileRepository.kt',
      confidence: 'resolved',
    });
  });

  it('treats framework packages as external', () => {
    expect(resolveImport(index, 'app/src/main/kotlin/com/acme/ui/ProfileScreen.kt', 'androidx.compose.runtime.Composable')).toEqual({
      kind: 'external',
      name: 'androidx.compose',
      ecosystem: 'maven',
    });
    expect(resolveImport(index, 'app/src/main/kotlin/com/acme/ui/ProfileScreen.kt', 'java.util.List')).toEqual({
      kind: 'external',
      name: 'java.util',
      ecosystem: 'jdk',
    });
  });
});

describe('Rust resolution', () => {
  it('resolves crate-relative modules', () => {
    expect(resolveImport(index, 'src/lib.rs', 'crate::engine::Renderer')).toEqual({
      kind: 'file',
      path: 'src/engine/mod.rs',
      confidence: 'heuristic',
    });
  });

  it('separates std from crates', () => {
    expect(resolveImport(index, 'src/lib.rs', 'std::collections::HashMap')).toEqual({
      kind: 'external',
      name: 'std',
      ecosystem: 'rust-std',
    });
    expect(resolveImport(index, 'src/lib.rs', 'serde::Deserialize')).toEqual({
      kind: 'external',
      name: 'serde',
      ecosystem: 'crates',
    });
  });
});
