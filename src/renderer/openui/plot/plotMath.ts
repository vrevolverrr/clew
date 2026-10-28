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
  const ticks: number[] = [];
  for (let i = first; i * step <= high + step * 1e-9; i++) ticks.push(+(i * step).toFixed(10));
  return ticks;
}

/** The smallest range with round ends that holds `[low, high]`. A flat range gets some height. */
export function niceDomain(low: number, high: number): [number, number] {
  if (high === low) {
    const pad = Math.abs(low) * 0.1 || 1;
    return niceDomain(low - pad, high + pad);
  }
  const step = niceStep(high - low, 5);
  return [+(Math.floor(low / step + 1e-9) * step).toFixed(10), +(Math.ceil(high / step - 1e-9) * step).toFixed(10)];
}

const MAX_LINES = 3;

/** Breaks a category name at spaces into lines of at most `maxChars`. `fits` is false when a word or the line count is too big. */
export function wrapLabel(name: string, maxChars: number): { lines: string[]; fits: boolean } {
  const lines: string[] = [];
  for (const word of name.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last]!.length + 1 + word.length <= maxChars) lines[last] += ` ${word}`;
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
