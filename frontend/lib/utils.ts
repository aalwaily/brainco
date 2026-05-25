// Heuristic: any Arabic letters in the string -> render RTL
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function isArabic(text: string): boolean {
  return ARABIC_RE.test(text);
}

export function dirFor(text: string): 'rtl' | 'ltr' {
  return isArabic(text) ? 'rtl' : 'ltr';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatEpoch(epoch: number): string {
  const d = new Date(epoch * 1000);
  return d.toLocaleString();
}
