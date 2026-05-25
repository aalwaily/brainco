/**
 * Bidirectional text helpers.
 *
 * Rules:
 *   - RTL = first strong char is Arabic / Hebrew / Persian etc.
 *   - LTR = first strong char is Latin / Cyrillic / CJK
 *   - Mixed = both scripts present (we report the *first strong* direction
 *             but mark `mixed: true` so callers can decide)
 *
 * The renderer uses the browser's native Unicode BiDi algorithm via
 * `dir="auto"` on block elements; these helpers are for places where we
 * need to know the direction at JS time (e.g. positioning a button on the
 * leading edge of the composer, or styling a chat row).
 */
export type Direction = 'ltr' | 'rtl';

export type DetectedLanguage =
  | 'ar'   // Arabic + Persian + Urdu (right-to-left scripts)
  | 'he'   // Hebrew
  | 'ja'   // Japanese (Hiragana / Katakana / Han mix)
  | 'zh'   // Chinese (Han mostly, no kana)
  | 'ur'   // Urdu (uses Arabic script + extras)
  | 'en'   // Latin script (default)
  | 'unknown';

// Strong-RTL ranges per Unicode 15 (Arabic, Hebrew, Syriac, Thaana, NKo, Samaritan, Mandaic).
const RTL_RANGE = /[֐-׿؀-ۿ܀-ݏހ-޿߀-߿ࠀ-࠯ࡀ-࡟ࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_LATIN = /[A-Za-zÀ-ɏЀ-ӿ]/;
const HIRAGANA  = /[぀-ゟ]/;
const KATAKANA  = /[゠-ヿ]/;
const HAN       = /[一-鿿]/;
const URDU_HINT = /[ٹپچڈڑژکگںھہۃیے]/;

/** Quick check — any RTL strong char anywhere in the text. */
export function hasRtl(text: string): boolean {
  return !!text && RTL_RANGE.test(text);
}
/** Quick check — any LTR strong char anywhere in the text. */
export function hasLtr(text: string): boolean {
  return !!text && LTR_LATIN.test(text);
}

/** First-strong direction — same algorithm as `dir="auto"`. */
export function detectDirection(text: string): Direction {
  if (!text) return 'ltr';
  for (const ch of text) {
    if (RTL_RANGE.test(ch)) return 'rtl';
    if (LTR_LATIN.test(ch) || HIRAGANA.test(ch) || KATAKANA.test(ch) || HAN.test(ch)) return 'ltr';
  }
  return 'ltr';
}

export function isMixed(text: string): boolean {
  return hasRtl(text) && hasLtr(text);
}

/** Best-effort language detection from script ratio. Returns `unknown` if
 *  the text has no strong characters at all. */
export function detectLanguage(text: string): DetectedLanguage {
  if (!text) return 'unknown';
  let rtl = 0, latin = 0, hira = 0, kata = 0, han = 0, urdu = 0;
  for (const ch of text) {
    if (RTL_RANGE.test(ch)) rtl++;
    if (URDU_HINT.test(ch)) urdu++;
    if (LTR_LATIN.test(ch)) latin++;
    if (HIRAGANA.test(ch))  hira++;
    if (KATAKANA.test(ch))  kata++;
    if (HAN.test(ch))       han++;
  }
  const total = rtl + latin + hira + kata + han;
  if (total === 0) return 'unknown';
  // Japanese needs kana to disambiguate from Chinese
  if (hira > 0 || kata > 0) return 'ja';
  if (han > Math.max(latin, rtl)) return 'zh';
  if (rtl > latin) {
    if (urdu > 0) return 'ur';
    // Hebrew range vs Arabic range
    if (/[֐-׿]/.test(text)) return 'he';
    return 'ar';
  }
  return 'en';
}

/** Wrap each contiguous run that flips direction in a `<bdi>` so the
 *  Unicode BiDi algorithm isolates it. Returns a tokenized array suitable
 *  for `React.createElement` consumption — JSX callers should map to <bdi>. */
export function resolveMixedText(
  text: string,
): Array<{ text: string; dir: Direction }> {
  if (!text) return [];
  const out: Array<{ text: string; dir: Direction }> = [];
  let cursor = 0;
  let currentDir: Direction = detectDirection(text);
  let buf = '';
  for (const ch of text) {
    // Determine this char's directional bucket
    let chDir: Direction | null = null;
    if (RTL_RANGE.test(ch)) chDir = 'rtl';
    else if (LTR_LATIN.test(ch) || HIRAGANA.test(ch) || KATAKANA.test(ch) || HAN.test(ch)) chDir = 'ltr';
    // Neutral (numbers, punctuation, whitespace) keep the current run.
    if (chDir && chDir !== currentDir && buf) {
      out.push({ text: buf, dir: currentDir });
      buf = '';
      currentDir = chDir;
    }
    buf += ch;
    cursor++;
  }
  if (buf) out.push({ text: buf, dir: currentDir });
  return out;
}
