/** Persisted user choice of LLM provider (localStorage). */
const KEY = 'acb.llm.provider';

export function readProviderPref(): string | null {
  try { return typeof window === 'undefined' ? null : localStorage.getItem(KEY); }
  catch { return null; }
}

export function writeProviderPref(value: string | null): void {
  try {
    if (value) localStorage.setItem(KEY, value);
    else       localStorage.removeItem(KEY);
  } catch {/* ignore */}
}
