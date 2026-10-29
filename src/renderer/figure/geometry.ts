export interface Point { readonly x: number; readonly y: number }
export interface Size { readonly width: number; readonly height: number }

/** Conservative fixed-font bounds, including long unbroken words and wide Unicode glyphs. */
export function labelSize(labels: readonly string[], width = 176): Size {
  const capacity = Math.floor((width - 24) / 14);
  const lines = labels.reduce((max, label) => Math.max(max, label.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].length / capacity)), 0)), 1);
  return { width, height: Math.max(30, 12 + 18 * lines) };
}

/** Fits single-line labels to an estimated 13px text width (wide glyphs count double); longer labels wrap at `max`. The base covers padding and the active 2px border. */
export function fittedSize(labels: readonly string[], min: number, max: number): Size {
  const unique = [...new Set(labels)];
  const lines = unique.map(label => label.split('\n'));
  const widest = Math.max(0, ...lines.flat().map(line => [...line].reduce((w, c) => w + (c.codePointAt(0)! >= 0x1100 ? 15 : 8), 24)));
  if (widest > max) return labelSize(unique, max);
  return { width: Math.max(min, widest), height: Math.max(30, 12 + 18 * Math.max(1, ...lines.map(l => l.length))) };
}

export function position(el: HTMLElement, p: Point): void {
  el.style.transform = `translate(${p.x}px, ${p.y}px)`;
}

export function status(tag: string): string { return tag === 'active' ? '▶ ' : tag === 'done' ? '✓ ' : ''; }
