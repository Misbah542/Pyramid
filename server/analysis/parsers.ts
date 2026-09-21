/**
 * Static source parsing.
 *
 * These are deliberately lightweight, line-oriented extractors rather than full
 * ASTs: RepoVerse needs the *shape* of a codebase (what imports what, what types
 * exist), and a regex pass over a few thousand files stays inside a request
 * budget where a real parser per language would not. Anything ambiguous is
 * reported as `heuristic` so the UI can say so instead of overclaiming.
 *
 * Adding a language means adding one entry to LANGUAGE_PARSERS.
 */

export interface ImportRef {
  specifier: string;
  line: number;
}

export interface SymbolDecl {
  name: string;
  kind: 'class' | 'interface' | 'function';
  line: number;
  /** Base types named on the declaration, when the syntax makes them explicit. */
  extends?: string[];
  implements?: string[];
}

export interface ParsedFile {
  imports: ImportRef[];
  symbols: SymbolDecl[];
  lineCount: number;
  /** `package` / `module` declaration, where the language has one. */
  packageName?: string;
}

const MAX_SYMBOLS_PER_FILE = 60;
const MAX_LINES_SCANNED = 6000;

type Extractor = (line: string, lineNo: number, out: ParsedFile) => void;

interface LanguageParser {
  extractors: Extractor[];
  /** Lines that are pure comments for this language. */
  commentPrefixes: string[];
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function pushImport(out: ParsedFile, specifier: string, line: number): void {
  const trimmed = specifier.trim();
  if (!trimmed || trimmed.length > 300) return;
  out.imports.push({ specifier: trimmed, line });
}

function pushSymbol(out: ParsedFile, symbol: SymbolDecl): void {
  if (out.symbols.length >= MAX_SYMBOLS_PER_FILE) return;
  if (!symbol.name || symbol.name.length > 80) return;
  out.symbols.push(symbol);
}

function splitTypeList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().replace(/<.*$/, '').replace(/\(.*$/, '').trim())
    .filter((entry) => /^[A-Za-z_][\w.]*$/.test(entry))
    .slice(0, 8);
}

/* ------------------------------------------------------------------ *
 * JavaScript / TypeScript family
 * ------------------------------------------------------------------ */

const JS_FROM = /(?:^|\s)(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/;
const JS_BARE_IMPORT = /^\s*import\s*['"]([^'"]+)['"]/;
const JS_REQUIRE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const JS_DYNAMIC = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

const jsImports: Extractor = (line, lineNo, out) => {
  const from = JS_FROM.exec(line);
  if (from) pushImport(out, from[1], lineNo);
  const bare = JS_BARE_IMPORT.exec(line);
  if (bare) pushImport(out, bare[1], lineNo);
  for (const match of line.matchAll(JS_REQUIRE)) pushImport(out, match[1], lineNo);
  for (const match of line.matchAll(JS_DYNAMIC)) pushImport(out, match[1], lineNo);
};

const JS_CLASS = /^\s*(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([\w$.]+))?(?:\s+implements\s+([^{]+))?/;
const JS_INTERFACE = /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([^{]+))?/;
const JS_FUNCTION = /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/;
const JS_ARROW = /^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/;

const jsSymbols: Extractor = (line, lineNo, out) => {
  const cls = JS_CLASS.exec(line);
  if (cls) {
    pushSymbol(out, {
      name: cls[1],
      kind: 'class',
      line: lineNo,
      extends: splitTypeList(cls[2]),
      implements: splitTypeList(cls[3]),
    });
    return;
  }
  const iface = JS_INTERFACE.exec(line);
  if (iface) {
    pushSymbol(out, { name: iface[1], kind: 'interface', line: lineNo, extends: splitTypeList(iface[2]) });
    return;
  }
  const fn = JS_FUNCTION.exec(line) ?? JS_ARROW.exec(line);
  if (fn) pushSymbol(out, { name: fn[1], kind: 'function', line: lineNo });
};

/* ------------------------------------------------------------------ *
 * Python
 * ------------------------------------------------------------------ */

const PY_FROM = /^\s*from\s+([.\w]+)\s+import\s/;
const PY_IMPORT = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/;
const PY_CLASS = /^\s*class\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s*:/;
const PY_DEF = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;

const pythonExtractors: Extractor[] = [
  (line, lineNo, out) => {
    const from = PY_FROM.exec(line);
    if (from) {
      pushImport(out, from[1], lineNo);
      return;
    }
    const imp = PY_IMPORT.exec(line);
    if (imp) {
      for (const part of imp[1].split(',')) pushImport(out, part.trim().split(/\s+as\s+/)[0], lineNo);
    }
  },
  (line, lineNo, out) => {
    const cls = PY_CLASS.exec(line);
    if (cls) {
      pushSymbol(out, { name: cls[1], kind: 'class', line: lineNo, extends: splitTypeList(cls[2]) });
      return;
    }
    const def = PY_DEF.exec(line);
    // Only module-level functions; indented defs are methods of a class node.
    if (def && def[1].length === 0) pushSymbol(out, { name: def[2], kind: 'function', line: lineNo });
  },
];

/* ------------------------------------------------------------------ *
 * Go
 * ------------------------------------------------------------------ */

const GO_SINGLE_IMPORT = /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/;
const GO_GROUP_ENTRY = /^\s*(?:[\w.]+\s+)?"([^"]+)"\s*$/;
const GO_TYPE = /^\s*type\s+([A-Za-z_]\w*)\s+(struct|interface)\b/;
const GO_FUNC = /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/;
const GO_PACKAGE = /^\s*package\s+([A-Za-z_]\w*)/;

function goExtractors(): Extractor[] {
  let inImportBlock = false;
  return [
    (line, lineNo, out) => {
      if (/^\s*import\s*\($/.test(line)) {
        inImportBlock = true;
        return;
      }
      if (inImportBlock) {
        if (/^\s*\)/.test(line)) {
          inImportBlock = false;
          return;
        }
        const entry = GO_GROUP_ENTRY.exec(line);
        if (entry) pushImport(out, entry[1], lineNo);
        return;
      }
      const single = GO_SINGLE_IMPORT.exec(line);
      if (single) pushImport(out, single[1], lineNo);
    },
    (line, lineNo, out) => {
      const pkg = GO_PACKAGE.exec(line);
      if (pkg && !out.packageName) out.packageName = pkg[1];
      const type = GO_TYPE.exec(line);
      if (type) {
        pushSymbol(out, { name: type[1], kind: type[2] === 'interface' ? 'interface' : 'class', line: lineNo });
        return;
      }
      const fn = GO_FUNC.exec(line);
      if (fn) pushSymbol(out, { name: fn[1], kind: 'function', line: lineNo });
    },
  ];
}

/* ------------------------------------------------------------------ *
 * JVM: Java, Kotlin, Scala
 * ------------------------------------------------------------------ */

const JVM_PACKAGE = /^\s*package\s+([\w.]+)/;
const JVM_IMPORT = /^\s*import\s+(?:static\s+)?([\w.*]+)/;
const JAVA_TYPE =
  /^\s*(?:public\s+|private\s+|protected\s+|final\s+|abstract\s+|static\s+|sealed\s+|open\s+)*(class|interface|enum|record)\s+([A-Za-z_]\w*)(?:<[^>]*>)?(?:\s+extends\s+([\w.<>,\s]+?))?(?:\s+implements\s+([\w.<>,\s]+?))?\s*(?:\{|$)/;
const KOTLIN_TYPE =
  /^\s*(?:public\s+|private\s+|internal\s+|protected\s+|abstract\s+|open\s+|sealed\s+|data\s+|value\s+|inner\s+|annotation\s+)*(class|interface|object)\s+([A-Za-z_]\w*)(?:<[^>]*>)?(?:\s*\([^)]*\))?(?:\s*:\s*([^{]+))?/;
const KOTLIN_FUN = /^\s*(?:public\s+|private\s+|internal\s+|protected\s+|suspend\s+|inline\s+|override\s+|open\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.<>]+\.)?([A-Za-z_]\w*)\s*\(/;
const SCALA_TYPE = /^\s*(?:private\s+|protected\s+|final\s+|sealed\s+|abstract\s+|case\s+)*(class|trait|object)\s+([A-Za-z_]\w*)(?:\s*\([^)]*\))?(?:\s+extends\s+([^{]+))?/;

const jvmImports: Extractor = (line, lineNo, out) => {
  const pkg = JVM_PACKAGE.exec(line);
  if (pkg && !out.packageName) {
    out.packageName = pkg[1];
    return;
  }
  const imp = JVM_IMPORT.exec(line);
  if (imp) pushImport(out, imp[1], lineNo);
};

const javaSymbols: Extractor = (line, lineNo, out) => {
  const match = JAVA_TYPE.exec(line);
  if (!match) return;
  pushSymbol(out, {
    name: match[2],
    kind: match[1] === 'interface' ? 'interface' : 'class',
    line: lineNo,
    extends: splitTypeList(match[3]),
    implements: splitTypeList(match[4]),
  });
};

const kotlinSymbols: Extractor = (line, lineNo, out) => {
  const type = KOTLIN_TYPE.exec(line);
  if (type) {
    // Kotlin does not distinguish extends/implements syntactically.
    pushSymbol(out, {
      name: type[2],
      kind: type[1] === 'interface' ? 'interface' : 'class',
      line: lineNo,
      extends: splitTypeList(type[3]),
    });
    return;
  }
  const fn = KOTLIN_FUN.exec(line);
  if (fn) pushSymbol(out, { name: fn[1], kind: 'function', line: lineNo });
};

const scalaSymbols: Extractor = (line, lineNo, out) => {
  const type = SCALA_TYPE.exec(line);
  if (type) {
    pushSymbol(out, {
      name: type[2],
      kind: type[1] === 'trait' ? 'interface' : 'class',
      line: lineNo,
      extends: splitTypeList(type[3]),
    });
  }
};

/* ------------------------------------------------------------------ *
 * Rust, Swift, C-family, Ruby, PHP, C#, Dart
 * ------------------------------------------------------------------ */

const RUST_USE = /^\s*(?:pub\s+)?use\s+([\w:{}, *]+);/;
const RUST_MOD = /^\s*(?:pub\s+)?mod\s+([A-Za-z_]\w*)\s*;/;
const RUST_TYPE = /^\s*(?:pub(?:\([^)]*\))?\s+)?(struct|enum|trait)\s+([A-Za-z_]\w*)/;
const RUST_FN = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/;
const RUST_IMPL = /^\s*impl(?:<[^>]*>)?\s+([\w:]+)(?:<[^>]*>)?\s+for\s+([\w:]+)/;

const rustExtractors: Extractor[] = [
  (line, lineNo, out) => {
    const use = RUST_USE.exec(line);
    if (use) {
      const head = use[1].split('::{')[0].trim();
      pushImport(out, head, lineNo);
      return;
    }
    const mod = RUST_MOD.exec(line);
    if (mod) pushImport(out, `self::${mod[1]}`, lineNo);
  },
  (line, lineNo, out) => {
    const type = RUST_TYPE.exec(line);
    if (type) {
      pushSymbol(out, { name: type[2], kind: type[1] === 'trait' ? 'interface' : 'class', line: lineNo });
      return;
    }
    const impl = RUST_IMPL.exec(line);
    if (impl) {
      pushSymbol(out, {
        name: impl[2].split('::').pop()!,
        kind: 'class',
        line: lineNo,
        implements: [impl[1].split('::').pop()!],
      });
      return;
    }
    const fn = RUST_FN.exec(line);
    if (fn) pushSymbol(out, { name: fn[1], kind: 'function', line: lineNo });
  },
];

const SWIFT_IMPORT = /^\s*import\s+([\w.]+)/;
const SWIFT_TYPE =
  /^\s*(?:public\s+|private\s+|internal\s+|fileprivate\s+|open\s+|final\s+)*(class|struct|protocol|enum|extension)\s+([A-Za-z_]\w*)(?:\s*:\s*([^{]+))?/;
const SWIFT_FUNC = /^\s*(?:public\s+|private\s+|internal\s+|static\s+|override\s+|final\s+)*func\s+([A-Za-z_]\w*)/;

const swiftExtractors: Extractor[] = [
  (line, lineNo, out) => {
    const imp = SWIFT_IMPORT.exec(line);
    if (imp) pushImport(out, imp[1], lineNo);
  },
  (line, lineNo, out) => {
    const type = SWIFT_TYPE.exec(line);
    if (type) {
      pushSymbol(out, {
        name: type[2],
        kind: type[1] === 'protocol' ? 'interface' : 'class',
        line: lineNo,
        extends: splitTypeList(type[3]),
      });
      return;
    }
    const fn = SWIFT_FUNC.exec(line);
    if (fn) pushSymbol(out, { name: fn[1], kind: 'function', line: lineNo });
  },
];

const C_INCLUDE = /^\s*#\s*include\s*[<"]([^>"]+)[>"]/;
const C_TYPE = /^\s*(?:template\s*<[^>]*>\s*)?(class|struct)\s+([A-Za-z_]\w*)(?:\s*:\s*(?:public|private|protected)\s+([\w:]+))?/;
const C_FUNC = /^[A-Za-z_][\w:<>,*&\s]*\s[*&]?([A-Za-z_]\w*)\s*\([^;]*\)\s*(?:const\s*)?\{/;

const cExtractors: Extractor[] = [
  (line, lineNo, out) => {
    const inc = C_INCLUDE.exec(line);
    if (inc) pushImport(out, inc[1], lineNo);
  },
  (line, lineNo, out) => {
    const type = C_TYPE.exec(line);
    if (type) {
      pushSymbol(out, { name: type[2], kind: 'class', line: lineNo, extends: splitTypeList(type[3]) });
      return;
    }
    const fn = C_FUNC.exec(line);
    if (fn && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(fn[1])) {
      pushSymbol(out, { name: fn[1], kind: 'function', line: lineNo });
    }
  },
];

const RUBY_REQUIRE = /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/;
const RUBY_TYPE = /^\s*(class|module)\s+([A-Za-z_]\w*)(?:\s*<\s*([\w:]+))?/;
const RUBY_DEF = /^\s*def\s+(?:self\.)?([a-z_]\w*[?!]?)/;

const rubyExtractors: Extractor[] = [
  (line, lineNo, out) => {
    const req = RUBY_REQUIRE.exec(line);
    if (req) pushImport(out, req[1], lineNo);
  },
  (line, lineNo, out) => {
    const type = RUBY_TYPE.exec(line);
    if (type) {
      pushSymbol(out, { name: type[2], kind: 'class', line: lineNo, extends: splitTypeList(type[3]) });
      return;
    }
    const def = RUBY_DEF.exec(line);
    if (def) pushSymbol(out, { name: def[1], kind: 'function', line: lineNo });
  },
];

const PHP_USE = /^\s*use\s+([\w\\]+)/;
const PHP_REQUIRE = /(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/;
const PHP_TYPE =
  /^\s*(?:final\s+|abstract\s+)*(class|interface|trait)\s+([A-Za-z_]\w*)(?:\s+extends\s+([\w\\]+))?(?:\s+implements\s+([\w\\,\s]+))?/;
const PHP_FUNC = /^\s*(?:public\s+|private\s+|protected\s+|static\s+)*function\s+([A-Za-z_]\w*)\s*\(/;

const phpExtractors: Extractor[] = [
  (line, lineNo, out) => {
    const use = PHP_USE.exec(line);
    if (use) pushImport(out, use[1].replace(/\\/g, '/'), lineNo);
    const req = PHP_REQUIRE.exec(line);
    if (req) pushImport(out, req[1], lineNo);
  },
  (line, lineNo, out) => {
    const type = PHP_TYPE.exec(line);
    if (type) {
      pushSymbol(out, {
        name: type[2],
        kind: type[1] === 'interface' ? 'interface' : 'class',
        line: lineNo,
        extends: splitTypeList(type[3]),
        implements: splitTypeList(type[4]),
      });
      return;
    }
    const fn = PHP_FUNC.exec(line);
    if (fn) pushSymbol(out, { name: fn[1], kind: 'function', line: lineNo });
  },
];

const CS_USING = /^\s*(?:global\s+)?using\s+(?:static\s+)?([\w.]+)\s*;/;
const CS_TYPE =
  /^\s*(?:public\s+|internal\s+|private\s+|protected\s+|sealed\s+|abstract\s+|static\s+|partial\s+|record\s+)*(class|interface|struct|record)\s+([A-Za-z_]\w*)(?:<[^>]*>)?(?:\s*:\s*([^{]+))?/;

const csharpExtractors: Extractor[] = [
  (line, lineNo, out) => {
    const using = CS_USING.exec(line);
    if (using) pushImport(out, using[1], lineNo);
    const ns = /^\s*namespace\s+([\w.]+)/.exec(line);
    if (ns && !out.packageName) out.packageName = ns[1];
  },
  (line, lineNo, out) => {
    const type = CS_TYPE.exec(line);
    if (type) {
      pushSymbol(out, {
        name: type[2],
        kind: type[1] === 'interface' ? 'interface' : 'class',
        line: lineNo,
        extends: splitTypeList(type[3]),
      });
    }
  },
];

const DART_IMPORT = /^\s*(?:import|export|part)\s+['"]([^'"]+)['"]/;
const DART_TYPE =
  /^\s*(?:abstract\s+)?(class|mixin|enum)\s+([A-Za-z_]\w*)(?:<[^>]*>)?(?:\s+extends\s+([\w.<>]+))?(?:\s+implements\s+([\w.<>,\s]+))?/;
const DART_FUNC = /^\s*(?:Future<[^>]*>|void|[A-Z]\w*|var)\s+([a-z_]\w*)\s*\(/;

const dartExtractors: Extractor[] = [
  (line, lineNo, out) => {
    const imp = DART_IMPORT.exec(line);
    if (imp) pushImport(out, imp[1], lineNo);
  },
  (line, lineNo, out) => {
    const type = DART_TYPE.exec(line);
    if (type) {
      pushSymbol(out, {
        name: type[2],
        kind: 'class',
        line: lineNo,
        extends: splitTypeList(type[3]),
        implements: splitTypeList(type[4]),
      });
      return;
    }
    const fn = DART_FUNC.exec(line);
    if (fn) pushSymbol(out, { name: fn[1], kind: 'function', line: lineNo });
  },
];

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

const LANGUAGE_PARSERS: Record<string, () => LanguageParser> = {
  typescript: () => ({ extractors: [jsImports, jsSymbols], commentPrefixes: ['//', '*', '/*'] }),
  javascript: () => ({ extractors: [jsImports, jsSymbols], commentPrefixes: ['//', '*', '/*'] }),
  vue: () => ({ extractors: [jsImports, jsSymbols], commentPrefixes: ['//', '*', '/*'] }),
  svelte: () => ({ extractors: [jsImports, jsSymbols], commentPrefixes: ['//', '*', '/*'] }),
  python: () => ({ extractors: pythonExtractors, commentPrefixes: ['#'] }),
  go: () => ({ extractors: goExtractors(), commentPrefixes: ['//'] }),
  java: () => ({ extractors: [jvmImports, javaSymbols], commentPrefixes: ['//', '*', '/*'] }),
  kotlin: () => ({ extractors: [jvmImports, kotlinSymbols], commentPrefixes: ['//', '*', '/*'] }),
  scala: () => ({ extractors: [jvmImports, scalaSymbols], commentPrefixes: ['//', '*', '/*'] }),
  rust: () => ({ extractors: rustExtractors, commentPrefixes: ['//'] }),
  swift: () => ({ extractors: swiftExtractors, commentPrefixes: ['//', '*', '/*'] }),
  c: () => ({ extractors: cExtractors, commentPrefixes: ['//', '*', '/*'] }),
  cpp: () => ({ extractors: cExtractors, commentPrefixes: ['//', '*', '/*'] }),
  ruby: () => ({ extractors: rubyExtractors, commentPrefixes: ['#'] }),
  php: () => ({ extractors: phpExtractors, commentPrefixes: ['//', '#', '*', '/*'] }),
  csharp: () => ({ extractors: csharpExtractors, commentPrefixes: ['//', '*', '/*'] }),
  dart: () => ({ extractors: dartExtractors, commentPrefixes: ['//', '*', '/*'] }),
};

export function canParse(languageId: string | null | undefined): boolean {
  return Boolean(languageId && languageId in LANGUAGE_PARSERS);
}

/**
 * Parses one source file. Never throws: a file we cannot read is simply a file
 * with no detected relationships.
 */
export function parseSource(languageId: string, content: string): ParsedFile {
  const out: ParsedFile = { imports: [], symbols: [], lineCount: 0 };
  const factory = LANGUAGE_PARSERS[languageId];
  if (!factory) {
    out.lineCount = countLines(content);
    return out;
  }

  const parser = factory();
  const lines = content.split('\n');
  out.lineCount = lines.length;

  const scanned = Math.min(lines.length, MAX_LINES_SCANNED);
  for (let i = 0; i < scanned; i += 1) {
    const line = lines[i];
    if (!line || line.length > 2000) continue;
    const trimmed = line.trimStart();
    if (!trimmed) continue;
    if (parser.commentPrefixes.some((prefix) => trimmed.startsWith(prefix))) continue;
    for (const extract of parser.extractors) {
      try {
        extract(line, i + 1, out);
      } catch {
        /* a malformed line is not worth failing an analysis over */
      }
    }
  }

  // De-duplicate import specifiers, keeping the first occurrence.
  const seen = new Set<string>();
  out.imports = out.imports.filter((ref) => {
    if (seen.has(ref.specifier)) return false;
    seen.add(ref.specifier);
    return true;
  });

  return out;
}

function countLines(content: string): number {
  let count = 1;
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) count += 1;
  }
  return count;
}
