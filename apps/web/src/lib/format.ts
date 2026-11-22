/** Up to two initials from an email address or a name. */
export function initials(value: string) {
  const parts = value.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('');
  return (letters || 'SB').toUpperCase();
}

/** 1 → "1 page", 3 → "3 pages" */
export function count(n: number, singular: string, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function longDate(date = new Date()) {
  return date
    .toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();
}

export function shortDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function dateTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 1_200_000 → "1.1 MB" */
export function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
