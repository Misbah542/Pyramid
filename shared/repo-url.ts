/**
 * GitHub repository URL parsing and validation.
 *
 * Used by the browser for instant input feedback and by the server as the
 * single gate on what the analyser is allowed to fetch. Only github.com is
 * accepted — never accept an arbitrary host here, it is the boundary that
 * keeps the analyser from being pointed at internal services.
 */

export interface RepoRef {
  owner: string;
  name: string;
  fullName: string;
  /** Explicit branch/tag from a `/tree/<ref>` URL, when present. */
  ref?: string;
}

export type RepoUrlError =
  | 'empty'
  | 'not-a-url'
  | 'wrong-host'
  | 'missing-owner'
  | 'missing-repository'
  | 'invalid-owner'
  | 'invalid-repository';

export const REPO_URL_ERROR_MESSAGES: Record<RepoUrlError, string> = {
  empty: 'Enter a GitHub repository URL.',
  'not-a-url': "That doesn't look like a URL. Try https://github.com/owner/repository.",
  'wrong-host': 'Only github.com repositories are supported.',
  'missing-owner': 'The URL is missing an owner.',
  'missing-repository': 'Add the repository name, e.g. github.com/owner/repository.',
  'invalid-owner': 'That owner name contains unsupported characters.',
  'invalid-repository': 'That repository name contains unsupported characters.',
};

const ALLOWED_HOSTS = new Set(['github.com', 'www.github.com']);
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9_.-]{1,100}$/;

export type ParseResult =
  | { ok: true; value: RepoRef }
  | { ok: false; error: RepoUrlError; message: string };

const fail = (error: RepoUrlError): ParseResult => ({
  ok: false,
  error,
  message: REPO_URL_ERROR_MESSAGES[error],
});

/**
 * Accepts the shapes people actually paste:
 *   https://github.com/owner/repo
 *   github.com/owner/repo.git
 *   git@github.com:owner/repo.git
 *   owner/repo
 *   https://github.com/owner/repo/tree/some-branch
 */
export function parseRepositoryUrl(input: string): ParseResult {
  const raw = input.trim();
  if (!raw) return fail('empty');

  let owner: string | undefined;
  let name: string | undefined;
  let ref: string | undefined;

  const scp = /^git@([^:]+):(.+)$/.exec(raw);
  if (scp) {
    if (!ALLOWED_HOSTS.has(scp[1].toLowerCase())) return fail('wrong-host');
    [owner, name] = scp[2].split('/');
  } else if (/^[^/\s:]+\/[^/\s:]+$/.test(raw) && !raw.includes('.com')) {
    // Bare `owner/repo` shorthand.
    [owner, name] = raw.split('/');
  } else {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      return fail('not-a-url');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fail('not-a-url');
    if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return fail('wrong-host');

    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (segments.length === 0) return fail('missing-owner');
    owner = segments[0];
    name = segments[1];
    if (segments[2] === 'tree' && segments[3]) {
      ref = segments.slice(3).join('/');
    }
  }

  if (!owner) return fail('missing-owner');
  if (!name) return fail('missing-repository');

  name = name.replace(/\.git$/i, '');

  if (!OWNER_RE.test(owner)) return fail('invalid-owner');
  if (!REPO_RE.test(name) || name === '.' || name === '..') return fail('invalid-repository');

  const value: RepoRef = { owner, name, fullName: `${owner}/${name}` };
  if (ref) value.ref = ref;
  return { ok: true, value };
}

/** Validates a `owner/name` pair that arrived as separate query parameters. */
export function parseFullName(fullName: string): ParseResult {
  const parts = fullName.split('/');
  if (parts.length !== 2) return fail('not-a-url');
  return parseRepositoryUrl(`${parts[0]}/${parts[1]}`);
}

export function repositoryUrl(ref: Pick<RepoRef, 'owner' | 'name'>): string {
  return `https://github.com/${ref.owner}/${ref.name}`;
}

/** A git ref is safe to embed in an API path only if it has no traversal. */
export function isSafeGitRef(ref: string): boolean {
  if (!ref || ref.length > 250) return false;
  if (ref.includes('..') || ref.startsWith('/') || ref.includes('\\')) return false;
  return /^[A-Za-z0-9._\-/]+$/.test(ref);
}
