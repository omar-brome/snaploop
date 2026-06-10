// Recent searches persisted in localStorage (newest first, deduped by href).

export interface RecentSearch {
  type: 'user' | 'tag' | 'place';
  label: string;
  href: string;
  avatarUrl?: string;
}

const STORAGE_KEY = 'snaploop-recent-searches';
const MAX_RECENTS = 10;

function isRecentSearch(value: unknown): value is RecentSearch {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.type === 'user' || v.type === 'tag' || v.type === 'place') &&
    typeof v.label === 'string' &&
    typeof v.href === 'string' &&
    (v.avatarUrl === undefined || typeof v.avatarUrl === 'string')
  );
}

export function getRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentSearch).slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

// Moves (or inserts) the entry to the front and returns the new list.
export function saveRecentSearch(entry: RecentSearch): RecentSearch[] {
  const next = [entry, ...getRecentSearches().filter((r) => r.href !== entry.href)].slice(
    0,
    MAX_RECENTS
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable/full — recents just won't persist this session.
  }
  return next;
}

// Removes a single entry (matched by href) and returns the new list.
export function removeRecentSearch(href: string): RecentSearch[] {
  const next = getRecentSearches().filter((r) => r.href !== href);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // noop
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}
