/**
 * A deliberately small syntax highlighter.
 *
 * Repository source is untrusted input, so it is never inserted as HTML: this
 * returns plain token objects that React renders as text nodes. It covers the
 * languages RepoVerse parses, at the granularity a preview pane needs.
 */

export type TokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'type' | 'function' | 'punctuation';

export interface Token {
  text: string;
  kind: TokenKind;
}

const COMMON = ['if', 'else', 'for', 'while', 'return', 'break', 'continue', 'new', 'try', 'catch', 'finally', 'throw', 'switch', 'case', 'default', 'do', 'in', 'is', 'as', 'null', 'true', 'false'];

const KEYWORDS: Record<string, string[]> = {
  typescript: [...COMMON, 'import', 'export', 'from', 'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum', 'extends', 'implements', 'async', 'await', 'yield', 'public', 'private', 'protected', 'readonly', 'static', 'abstract', 'declare', 'namespace', 'satisfies', 'keyof', 'typeof', 'this', 'super', 'undefined', 'void', 'never', 'unknown', 'any', 'of'],
  python: [...COMMON, 'def', 'class', 'import', 'from', 'lambda', 'with', 'yield', 'async', 'await', 'pass', 'raise', 'global', 'nonlocal', 'assert', 'del', 'elif', 'except', 'None', 'True', 'False', 'and', 'or', 'not', 'self'],
  go: [...COMMON, 'func', 'package', 'import', 'type', 'struct', 'interface', 'map', 'chan', 'go', 'defer', 'select', 'range', 'var', 'const', 'nil', 'fallthrough'],
  java: [...COMMON, 'class', 'interface', 'enum', 'record', 'extends', 'implements', 'import', 'package', 'public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'volatile', 'transient', 'native', 'this', 'super', 'void', 'int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short', 'instanceof'],
  kotlin: [...COMMON, 'fun', 'val', 'var', 'class', 'object', 'interface', 'data', 'sealed', 'open', 'override', 'suspend', 'companion', 'import', 'package', 'when', 'internal', 'private', 'public', 'protected', 'lateinit', 'init', 'constructor', 'by', 'this', 'super', 'it'],
  rust: [...COMMON, 'fn', 'let', 'mut', 'struct', 'enum', 'trait', 'impl', 'use', 'mod', 'pub', 'crate', 'self', 'super', 'match', 'move', 'ref', 'where', 'async', 'await', 'dyn', 'unsafe', 'const', 'static'],
  swift: [...COMMON, 'func', 'let', 'var', 'class', 'struct', 'protocol', 'extension', 'enum', 'import', 'guard', 'defer', 'init', 'self', 'override', 'private', 'public', 'internal', 'fileprivate', 'open', 'final', 'static', 'where', 'async', 'await'],
  ruby: [...COMMON, 'def', 'end', 'module', 'class', 'require', 'require_relative', 'attr_accessor', 'attr_reader', 'attr_writer', 'unless', 'elsif', 'then', 'yield', 'self', 'nil', 'puts'],
  php: [...COMMON, 'function', 'class', 'interface', 'trait', 'namespace', 'use', 'public', 'private', 'protected', 'static', 'echo', 'require', 'include', 'extends', 'implements', 'foreach', 'endforeach', 'array', 'null'],
  csharp: [...COMMON, 'class', 'interface', 'struct', 'record', 'namespace', 'using', 'public', 'private', 'protected', 'internal', 'static', 'readonly', 'override', 'virtual', 'async', 'await', 'var', 'void', 'string', 'int', 'bool', 'this', 'base'],
  dart: [...COMMON, 'class', 'import', 'export', 'extends', 'implements', 'mixin', 'abstract', 'final', 'const', 'var', 'void', 'async', 'await', 'factory', 'required', 'late', 'this', 'super', 'widget'],
  c: [...COMMON, 'include', 'define', 'struct', 'union', 'enum', 'typedef', 'static', 'const', 'void', 'int', 'char', 'float', 'double', 'unsigned', 'signed', 'sizeof', 'extern'],
  cpp: [...COMMON, 'include', 'class', 'struct', 'template', 'typename', 'namespace', 'using', 'public', 'private', 'protected', 'virtual', 'override', 'const', 'constexpr', 'auto', 'nullptr', 'static_cast', 'std'],
  scala: [...COMMON, 'def', 'val', 'var', 'class', 'object', 'trait', 'extends', 'with', 'import', 'package', 'case', 'match', 'implicit', 'override', 'sealed', 'abstract', 'lazy'],
  json: ['true', 'false', 'null'],
  yaml: ['true', 'false', 'null'],
};

const ALIASES: Record<string, string> = {
  javascript: 'typescript',
  vue: 'typescript',
  svelte: 'typescript',
  jsx: 'typescript',
  tsx: 'typescript',
  toml: 'yaml',
  gradle: 'kotlin',
  objc: 'c',
};

const LINE_COMMENT: Record<string, string[]> = {
  python: ['#'],
  ruby: ['#'],
  yaml: ['#'],
  shell: ['#'],
  php: ['//', '#'],
};

function keywordsFor(language: string | null): Set<string> {
  if (!language) return new Set();
  const resolved = ALIASES[language] ?? language;
  return new Set(KEYWORDS[resolved] ?? KEYWORDS.typescript);
}

function lineCommentTokens(language: string | null): string[] {
  if (!language) return ['//'];
  const resolved = ALIASES[language] ?? language;
  return LINE_COMMENT[resolved] ?? ['//'];
}

const IDENTIFIER_RE = /[A-Za-z_$][\w$]*/y;
const NUMBER_RE = /0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[a-zA-Z]*/y;
const WHITESPACE_RE = /\s+/y;

/**
 * Tokenises a single line. Block comments spanning lines are tracked by the
 * caller through `inBlockComment`.
 */
export function tokenizeLine(
  line: string,
  language: string | null,
  inBlockComment: boolean,
): { tokens: Token[]; inBlockComment: boolean } {
  const keywords = keywordsFor(language);
  const commentStarts = lineCommentTokens(language);
  const tokens: Token[] = [];
  let index = 0;
  let blockComment = inBlockComment;

  const pushToken = (text: string, kind: TokenKind) => {
    if (!text) return;
    const previous = tokens[tokens.length - 1];
    if (previous && previous.kind === kind) previous.text += text;
    else tokens.push({ text, kind });
  };

  while (index < line.length) {
    if (blockComment) {
      const end = line.indexOf('*/', index);
      if (end === -1) {
        pushToken(line.slice(index), 'comment');
        return { tokens, inBlockComment: true };
      }
      pushToken(line.slice(index, end + 2), 'comment');
      index = end + 2;
      blockComment = false;
      continue;
    }

    const rest = line.slice(index);

    if (rest.startsWith('/*')) {
      blockComment = true;
      continue;
    }

    const lineComment = commentStarts.find((token) => rest.startsWith(token));
    if (lineComment) {
      pushToken(rest, 'comment');
      return { tokens, inBlockComment: false };
    }

    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === '`') {
      let cursor = 1;
      while (cursor < rest.length) {
        if (rest[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (rest[cursor] === quote) {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      pushToken(rest.slice(0, cursor), 'string');
      index += cursor;
      continue;
    }

    WHITESPACE_RE.lastIndex = index;
    const whitespace = WHITESPACE_RE.exec(line);
    if (whitespace) {
      pushToken(whitespace[0], 'plain');
      index = WHITESPACE_RE.lastIndex;
      continue;
    }

    NUMBER_RE.lastIndex = index;
    const number = NUMBER_RE.exec(line);
    if (number && /\d/.test(number[0][0])) {
      pushToken(number[0], 'number');
      index = NUMBER_RE.lastIndex;
      continue;
    }

    IDENTIFIER_RE.lastIndex = index;
    const identifier = IDENTIFIER_RE.exec(line);
    if (identifier) {
      const word = identifier[0];
      const next = line[IDENTIFIER_RE.lastIndex];
      let kind: TokenKind = 'plain';
      if (keywords.has(word)) kind = 'keyword';
      else if (next === '(') kind = 'function';
      else if (/^[A-Z]/.test(word)) kind = 'type';
      pushToken(word, kind);
      index = IDENTIFIER_RE.lastIndex;
      continue;
    }

    const char = line[index];
    pushToken(char, /[{}()[\];,.:<>=+\-*/%!&|?]/.test(char) ? 'punctuation' : 'plain');
    index += 1;
  }

  return { tokens, inBlockComment: blockComment };
}

export interface HighlightedLine {
  number: number;
  tokens: Token[];
}

export function highlight(source: string, language: string | null, maxLines = 4000): HighlightedLine[] {
  const lines = source.split('\n').slice(0, maxLines);
  const result: HighlightedLine[] = [];
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i += 1) {
    const { tokens, inBlockComment: next } = tokenizeLine(lines[i], language, inBlockComment);
    inBlockComment = next;
    result.push({ number: i + 1, tokens });
  }
  return result;
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: 'text-ink/85',
  keyword: 'text-node-class',
  string: 'text-node-test',
  comment: 'text-faint italic',
  number: 'text-node-function',
  type: 'text-node-interface',
  function: 'text-node-directory',
  punctuation: 'text-muted',
};
