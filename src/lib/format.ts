/** Small formatting helpers shared across panels. */

export function formatCount(value: number | undefined | null): string {
  if (value === undefined || value === null) return '—';
  return value.toLocaleString('en-US');
}

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} m ${Math.round((ms % 60_000) / 1000)} s`;
}

export function formatRelativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(delta)) return '';
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Trims long paths so both ends stay readable. */
export function truncatePath(path: string, maxLength = 46): string {
  if (path.length <= maxLength) return path;
  const segments = path.split('/');
  if (segments.length <= 2) return `…${path.slice(-(maxLength - 1))}`;
  const last = segments[segments.length - 1];
  const short = `${segments[0]}/…/${last}`;
  return short.length <= maxLength ? short : `…/${last}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function percent(value: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}
