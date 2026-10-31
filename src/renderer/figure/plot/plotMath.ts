/** A step of 1, 2 or 5 times a power of ten that splits `span` into about `count` parts. */
function niceStep(span: number, count: number): number {
  const raw = span / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const lead = +(raw / magnitude).toFixed(9);
  return (lead < 1.5 ? 1 : lead < 3 ? 2 : lead < 7 ? 5 : 10) * magnitude;
}

/** Round values inside `[low, high]`, about `count` of them. */
export function niceTicks(low: number, high: number, count: number): number[] {
  const step = niceStep(high - low, count);
  const first = Math.ceil(low / step - 1e-9);
  const last = Math.floor(high / step + 1e-9);
  // Counted, not stepped by i++: far from zero (1e20) adding 1 to i no longer changes it, and the loop would never end.
  const n = Math.min(last - first, MAX_TICKS);
  if (!Number.isFinite(n) || n < 0) return [low, high];
  return Array.from({ length: n + 1 }, (_, k) => round((first + k) * step));
}

const MAX_TICKS = 100;
/** Rounds away floating-point noise, keeping 12 significant digits so a tiny range (1e-12) keeps its size. */
const round = (value: number): number => +value.toPrecision(12);

/** The smallest range with round ends that holds `[low, high]`. A flat range gets some height. */
export function niceDomain(low: number, high: number): [number, number] {
  if (high === low) {
    const pad = Math.abs(low) * 0.1 || 1;
    return niceDomain(low - pad, high + pad);
  }
  const step = niceStep(high - low, 5);
  return [round(Math.floor(low / step + 1e-9) * step), round(Math.ceil(high / step - 1e-9) * step)];
}

const MAX_LINES = 3;

/** Breaks a category name at spaces into lines of at most `maxChars`. `fits` is false when a word or the line count is too big. */
export function wrapLabel(name: string, maxChars: number): { lines: string[]; fits: boolean } {
  const lines: string[] = [];
  for (const word of name.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + word.length <= maxChars) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return { lines, fits: lines.length <= MAX_LINES && lines.every((line) => line.length <= maxChars) };
}

interface BarStep {
  from: number;
  to: number;
  /** What the bar shows: a plain bar, a waterfall total, or a waterfall change up or down. */
  kind: 'bar' | 'total' | 'up' | 'down';
  /** The number printed on the bar. */
  value: number;
}

/**
 * Where each bar of a `Bars` layer starts and ends. In a waterfall the first bar and every bar given as null stand on
 * the baseline and show the running total, so the model supplies changes and never adds them up.
 */
export function barSteps(values: readonly (number | null)[], mode: 'bars' | 'waterfall'): BarStep[] {
  if (mode === 'bars') return values.map((v) => ({ from: 0, to: v ?? 0, kind: 'bar', value: v ?? 0 }));
  let running = 0;
  return values.map((v, i) => {
    if (v === null) return { from: 0, to: running, kind: 'total', value: running };
    if (i === 0) {
      running = v;
      return { from: 0, to: v, kind: 'total', value: v };
    }
    const from = running;
    running += v;
    return { from, to: running, kind: v >= 0 ? 'up' : 'down', value: v };
  });
}

export const minus = (text: string): string => text.replaceAll('-', '−');
/** A tick value as shown: thousands as K, and below 0.001 in significant digits, which fixed decimals would round to 0. */
export const tickText = (v: number): string => (Math.abs(v) >= 10000 ? `${minus(String(+(v / 1000).toFixed(1)))}K` : minus(String(v !== 0 && Math.abs(v) < 1e-3 ? +v.toPrecision(3) : +v.toFixed(4))));
