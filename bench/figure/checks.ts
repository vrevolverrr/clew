import type { Rect, StateGeometry, TextBox } from './geometry';

export interface Finding { check: string; detail: string }

const EDGE = 1;
const OVERLAP = 2;
const MIN_CONTRAST = 3;
const MIN_TEXT_PX = 9;

const quote = (box: TextBox) => JSON.stringify(box.text.slice(0, 40));

function intersection(a: Rect, b: Rect): { w: number; h: number } {
  return { w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) };
}

const outside = (inner: Rect, outer: Rect) => inner.x < outer.x - EDGE || inner.y < outer.y - EDGE
  || inner.x + inner.w > outer.x + outer.w + EDGE || inner.y + inner.h > outer.y + outer.h + EDGE;

/** `rgb(…)`, `rgba(…)` or `color(srgb …)` as 0–255 channels and alpha; undefined for anything else. */
export function parseColour(text: string): [number, number, number, number] | undefined {
  const srgb = text.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])];
  const rgb = text.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  return undefined;
}

const luminance = ([r, g, b]: number[]) => {
  const linear = (c: number) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

/** WCAG contrast of `fg` drawn over `bg`, blending a translucent `fg` into the background. */
export function contrast(fg: string, bg: string): number | undefined {
  const f = parseColour(fg);
  const b = parseColour(bg);
  if (!f || !b) return undefined;
  const blended = [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3]));
  const [hi, lo] = [luminance(blended), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** What is wrong with one measured state of a visual. */
export function check(state: StateGeometry): Finding[] {
  const found: Finding[] = [];
  const add = (check: string, detail: string) => found.push({ check, detail });
  if (state.error) add('error', state.error);
  for (const attr of state.badAttributes) add('bad-number', attr);
  if (state.pageScrollsSideways) add('page-scroll', 'the chat scrolls sideways');
  if (state.rect.h < 16) add('empty', `drawn ${Math.round(state.rect.h)} px tall`);
  const frame: Rect = { x: 0, y: 0, w: state.width, h: Infinity };
  const { texts } = state;
  for (const box of texts) {
    if (box.clip && !box.scrolls && outside(box, box.clip)) add('clipped', `${quote(box)} is cut off by its container`);
    else if (!box.scrolls && outside(box, frame)) add('overflow', `${quote(box)} runs past the visual's edge`);
    if (box.kind !== 'math' && box.kind !== 'control' && (box.h < MIN_TEXT_PX || (box.kind !== 'svg' && box.px < MIN_TEXT_PX + 1))) {
      add('tiny-text', `${quote(box)} is ${Math.round(box.h)} px tall`);
    }
    const ratio = box.kind === 'svg' ? undefined : contrast(box.fg, box.bg);
    if (ratio !== undefined && ratio < MIN_CONTRAST) add('low-contrast', `${quote(box)} has contrast ${ratio.toFixed(2)}`);
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const { w, h } = intersection(texts[i], texts[j]);
      if (w > OVERLAP && h > OVERLAP) add('overlap', `${quote(texts[i])} overlaps ${quote(texts[j])}`);
    }
  }
  return found;
}

/** A visual whose height changes between steps makes the reply below it jump. */
export function heightJumps(states: StateGeometry[]): Finding[] {
  const steps = states.filter(({ state }) => state.startsWith('step:'));
  if (steps.length < 2) return [];
  const heights = steps.map(({ rect }) => rect.h);
  const spread = Math.max(...heights) - Math.min(...heights);
  return spread > 2 ? [{ check: 'height-jump', detail: `height changes by ${Math.round(spread)} px between steps` }] : [];
}

export type Snapshot = [kind: string, text: string, x: number, y: number, w: number, h: number][];

const round = (value: number) => Math.round(value / 2) * 2;

/** Text boxes rounded to 2 px, the golden for one state. */
export function snapshot(state: StateGeometry): Snapshot {
  return state.texts
    .map((box): Snapshot[number] => [box.kind, box.text, round(box.x), round(box.y), round(box.w), round(box.h)])
    .sort((a, b) => a[3] - b[3] || a[2] - b[2] || a[1].localeCompare(b[1]));
}

/** How `now` differs from the golden: texts gone, new, or moved or resized by more than `tolerance` px. */
export function compare(golden: Snapshot, now: Snapshot, tolerance = 2): string[] {
  const key = (box: Snapshot[number]) => `${box[0]}|${box[1]}`;
  const pool = new Map<string, Snapshot[number][]>();
  for (const box of golden) pool.set(key(box), [...(pool.get(key(box)) ?? []), box]);
  const changes: string[] = [];
  for (const box of now) {
    const candidates = pool.get(key(box)) ?? [];
    if (!candidates.length) { changes.push(`new ${JSON.stringify(box[1])}`); continue; }
    const distance = (old: Snapshot[number]) => Math.max(...[2, 3, 4, 5].map((i) => Math.abs((old[i] as number) - (box[i] as number))));
    const nearest = candidates.reduce((best, old) => (distance(old) < distance(best) ? old : best));
    candidates.splice(candidates.indexOf(nearest), 1);
    if (distance(nearest) > tolerance) changes.push(`moved ${JSON.stringify(box[1])} by ${distance(nearest)} px`);
  }
  for (const rest of pool.values()) for (const box of rest) changes.push(`gone ${JSON.stringify(box[1])}`);
  return changes;
}
