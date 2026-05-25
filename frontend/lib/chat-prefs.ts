// localStorage helpers for per-chat preferences (pin + rename).
// Survives reloads, no backend changes required.

const PIN_KEY    = 'acb.history.pinned';
const TITLES_KEY = 'acb.history.titles';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {/* ignore */}
}

export function getPinned(): number[] {
  return read<number[]>(PIN_KEY, []);
}
export function isPinned(id: number): boolean {
  return getPinned().includes(id);
}
export function togglePin(id: number): boolean {
  const list = getPinned();
  const exists = list.includes(id);
  const next = exists ? list.filter((x) => x !== id) : [id, ...list];
  write(PIN_KEY, next);
  return !exists;
}

export function getTitles(): Record<string, string> {
  return read<Record<string, string>>(TITLES_KEY, {});
}
export function getTitle(id: number): string | null {
  return getTitles()[String(id)] ?? null;
}
export function setTitle(id: number, title: string | null): void {
  const map = getTitles();
  if (title && title.trim()) map[String(id)] = title.trim();
  else delete map[String(id)];
  write(TITLES_KEY, map);
}

export function dropAll(id: number): void {
  const list = getPinned().filter((x) => x !== id);
  write(PIN_KEY, list);
  const map = getTitles();
  delete map[String(id)];
  write(TITLES_KEY, map);
}
