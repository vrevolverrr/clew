import { findMatchingDollarRun, isBackslashEscaped, readDollarRun } from './markdownSegments';

/**
 * Inline `$...$` math in a plain message, found by the same rules that draw a reply's Markdown, so a price such as
 * `$5 and $10` stays text and the two never disagree.
 */
export function inlineMathRanges(text: string): { start: number; end: number; source: string }[] {
  const ranges: { start: number; end: number; source: string }[] = [];
  for (let index = text.indexOf('$'); index >= 0 && index < text.length; index += 1) {
    if (text[index] !== '$' || isBackslashEscaped(text, index)) continue;
    const run = readDollarRun(text, index);
    const close = run === 1 ? findMatchingDollarRun(text, index, 1) : null;
    if (close === null) {
      index += run - 1;
      continue;
    }
    ranges.push({ start: index, end: close + 1, source: text.slice(index + 1, close) });
    index = close;
  }
  return ranges;
}
