interface QuoteSpan {
  start: number;
  end: number;
}

/** Markdown emphasis, code ticks, math dollars, escapes and zero-width characters: a quote may leave them out or add them. */
const IGNORED = /[*_`~$\\​-‍﻿]/;
/** What starts a quoted, bulleted, numbered or heading line, with a callout's `[!type]`; a quote that spans lines leaves it out. */
const LINE_MARKER = /(?:>\s*)+(?:\[![^\]\s]*\][+-]?\s*)?|[-+*]\s|#{1,6}\s|\d{1,3}[.)]\s/y;
const SWAPPED: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '−': '-', '…': '...' };

/** `at[i]` is where the folded character `i` came from in the source. */
interface Folded {
  text: string;
  at: number[];
}

/**
 * Reduces text to what a reader would call the same words: one space for any run of whitespace, no Markdown marks or
 * line prefixes, straight quotes and dashes. A quote and its note fold alike, so the quote may be written either way.
 */
function fold(source: string, lower: boolean): Folded {
  let text = '';
  const at: number[] = [];
  let gap = false;
  // The start of the text is the start of a line, so a quote may begin with a marker too.
  let broke = true;
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (/\s/.test(char)) {
      gap = true;
      broke ||= char === '\n';
      continue;
    }
    if (broke) {
      LINE_MARKER.lastIndex = i;
      const marker = LINE_MARKER.exec(source);
      if (marker) {
        i += marker[0].length - 1;
        continue;
      }
    }
    if (IGNORED.test(char)) continue;
    if (gap && text) {
      text += ' ';
      at.push(i);
    }
    gap = broke = false;
    for (const out of SWAPPED[char] ?? (lower ? char.toLowerCase() : char)) {
      text += out;
      at.push(i);
    }
  }
  return { text, at };
}

interface QuoteOptions {
  /** The 1-indexed line the quote is expected near; of several matches the nearest wins. */
  line?: number;
  /** Count a match only where it starts and ends at a word edge, so "cat" is not found inside "concatenate". */
  wholeWords?: boolean;
}

const WORD = /[\p{L}\p{N}]/u;
/** Every place `quote` occurs in `content`: as written, else ignoring case. Empty when the text is not there. */
export function quoteMatches(content: string, quote: string, wholeWords = false): QuoteSpan[] {
  for (const lower of [false, true]) {
    const needle = fold(quote, lower).text;
    if (!needle) return [];
    const haystack = fold(content, lower);
    const edge = (index: number): boolean => !WORD.test(haystack.text[index] ?? '');
    const spans: QuoteSpan[] = [];
    for (let from = haystack.text.indexOf(needle); from !== -1; from = haystack.text.indexOf(needle, from + 1)) {
      const to = from + needle.length;
      if (wholeWords && ((WORD.test(needle[0]!) && !edge(from - 1)) || (WORD.test(needle.at(-1)!) && !edge(to)))) continue;
      spans.push({ start: haystack.at[from]!, end: haystack.at[to - 1]! + 1 });
    }
    if (spans.length) return spans;
  }
  return [];
}

/**
 * Finds `quote` in `content`, with how many places it occurs. Text selected in reading view lost its line breaks and
 * spacing, and a model's quote may drop Markdown marks, so both are compared folded.
 */
export function findQuote(content: string, quote: string, { line, wholeWords }: QuoteOptions = {}): { span: QuoteSpan; count: number } | null {
  const spans = quoteMatches(content, quote, wholeWords);
  if (!spans.length) return null;
  const target = line ? lineOffset(content, line) : 0;
  const span = spans.reduce((best, next) => (Math.abs(next.start - target) < Math.abs(best.start - target) ? next : best));
  return { span, count: spans.length };
}

function lineOffset(content: string, line: number): number {
  let offset = 0;
  for (let n = 1; n < line; n++) {
    const next = content.indexOf('\n', offset);
    if (next === -1) return content.length;
    offset = next + 1;
  }
  return offset;
}

const CALLOUT_START = /^\s*>\s*\[!/;

const isQuoted = (line: string | undefined): boolean => line?.trimStart().startsWith('>') ?? false;

/** Whether `pos` lies in a callout: a run of `>` lines whose first line opens with `> [!type]`. */
export function inCallout(content: string, pos: number): boolean {
  const lines = content.split('\n');
  let index = content.slice(0, pos).split('\n').length - 1;
  if (!isQuoted(lines[index])) return false;
  while (isQuoted(lines[index - 1])) index--;
  return CALLOUT_START.test(lines[index]!);
}
