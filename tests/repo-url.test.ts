import { describe, expect, it } from 'vitest';
import { isSafeGitRef, parseRepositoryUrl } from '@shared/repo-url';

describe('parseRepositoryUrl', () => {
  it('accepts the shapes people paste', () => {
    const cases = [
      'https://github.com/pallets/flask',
      'http://github.com/pallets/flask',
      'github.com/pallets/flask',
      'www.github.com/pallets/flask/',
      'https://github.com/pallets/flask.git',
      'git@github.com:pallets/flask.git',
      'pallets/flask',
      '  https://github.com/pallets/flask  ',
    ];
    for (const input of cases) {
      const result = parseRepositoryUrl(input);
      expect(result.ok, input).toBe(true);
      if (result.ok) expect(result.value.fullName).toBe('pallets/flask');
    }
  });

  it('extracts an explicit branch from a /tree/ URL', () => {
    const result = parseRepositoryUrl('https://github.com/owner/repo/tree/release/2.x');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ref).toBe('release/2.x');
  });

  it('rejects hosts other than github.com', () => {
    for (const input of ['https://gitlab.com/a/b', 'https://evil.example.com/a/b', 'git@gitlab.com:a/b.git']) {
      const result = parseRepositoryUrl(input);
      expect(result.ok, input).toBe(false);
      if (!result.ok) expect(result.error).toBe('wrong-host');
    }
  });

  it('rejects malformed input', () => {
    expect(parseRepositoryUrl('').ok).toBe(false);
    expect(parseRepositoryUrl('https://github.com/').ok).toBe(false);
    expect(parseRepositoryUrl('https://github.com/owner').ok).toBe(false);
    expect(parseRepositoryUrl('https://github.com/own er/repo').ok).toBe(false);
  });

  it('never lets a path traversal through as a repository name', () => {
    const result = parseRepositoryUrl('https://github.com/owner/..');
    expect(result.ok).toBe(false);
  });
});

describe('isSafeGitRef', () => {
  it('accepts ordinary refs', () => {
    expect(isSafeGitRef('main')).toBe(true);
    expect(isSafeGitRef('release/2.x')).toBe(true);
    expect(isSafeGitRef('0f4a1c8e9b2d3f5a6c7b8e9d0a1b2c3d4e5f6071')).toBe(true);
  });

  it('rejects traversal and absolute paths', () => {
    expect(isSafeGitRef('../../etc/passwd')).toBe(false);
    expect(isSafeGitRef('/etc/passwd')).toBe(false);
    expect(isSafeGitRef('main;rm -rf /')).toBe(false);
    expect(isSafeGitRef('')).toBe(false);
  });
});
