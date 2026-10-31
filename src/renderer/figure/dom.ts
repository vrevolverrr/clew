import type { Rgb } from '@/renderer/figure/figureTex';

const NS = 'http://www.w3.org/2000/svg';

/** Creates an SVG element with attributes, optionally under `parent` and holding `text`. */
export function svg(tag: string, attrs: Record<string, string | number | undefined>, parent?: Element, text?: string): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) if (value !== undefined) el.setAttribute(name, String(value));
  parent?.appendChild(el);
  if (text !== undefined) el.textContent = text;
  return el;
}

let markerId = 0;

/**
 * Returns the `marker-end` value for an arrowhead in a CSS colour, making one marker per colour in `drawing`. A marker
 * takes its colour from where it is defined, and Obsidian's Chromium draws a `context-stroke` head black.
 */
export function arrowHeads(drawing: SVGElement, size: Record<string, string | number>): (fill: string) => string {
  const defs = svg('defs', {}, drawing);
  const made = new Map<string, string>();
  return (fill) => {
    let id = made.get(fill);
    if (!id) {
      id = `clew-figure-arrow-${(markerId += 1)}`;
      const head = svg('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, orient: 'auto-start-reverse', ...size }, defs);
      svg('path', { d: 'M0 0L10 5L0 10z' }, head).style.fill = fill;
      made.set(fill, id);
    }
    return `url(#${id})`;
  };
}

/** A tag's ink, as `styles.css` defines it on `.clew-figure`. */
export const tagInk = (tag: string): string => `var(--clew-figure-tag-${tag})`;

/** An arrowhead's fill: the colour its line's tag strokes it in (`styles.css`); a dimmed line only fades. */
export const lineInk = (tag?: string): string => (tag && tag !== 'dim' ? tagInk(tag) : 'var(--text-muted)');

export function div(className: string, role?: string): HTMLElement {
  const el = createDiv();
  el.className = className;
  if (role) el.setAttribute('role', role);
  return el;
}

export function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** `rgb(…)`, `rgba(…)` or `color(srgb …)` as 0–255 integers; grey when the colour cannot be read. */
export function parseColour(text: string): Rgb {
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(text);
  if (srgb) return [1, 2, 3].map((i) => Math.round(Number(srgb[i]) * 255)) as unknown as Rgb;
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  return rgb ? ([1, 2, 3].map((i) => Math.round(Number(rgb[i]))) as unknown as Rgb) : [128, 128, 128];
}

/** A CSS colour as the browser resolves it under `parent`, read from a probe: a custom property's own text is not a colour. */
export function computedColour(parent: HTMLElement, value: string): string {
  const probe = parent.appendChild(div('clew-figure-probe'));
  probe.style.color = value;
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}
