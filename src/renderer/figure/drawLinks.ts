import { div, svg } from '@/renderer/figure/dom';
import type { FigureNode } from '@/renderer/figure/FigureData';

export type Link = Extract<FigureNode, { type: 'Arrow' | 'Pointer' }>;
type Box = { el: Element; l: number; t: number; r: number; b: number };

let markerId = 0;

/** Draws a step's arrows and pointers over it, from the boxes of the elements they name; call again after anything moves. */
export function drawLinks(step: HTMLElement, links: readonly Link[], markdown: (el: HTMLElement, text: string | number) => void): void {
  step.querySelector(':scope > .clew-figure-links')?.remove();
  if (!links.length) return;
  const layer = step.appendChild(div('clew-figure-links'));
  layer.setAttribute('aria-hidden', 'true');
  const frame = step.getBoundingClientRect();
  const drawing = svg('svg', { class: 'clew-figure-links-svg', width: frame.width, height: frame.height }, layer);
  const marker = `clew-figure-link-arrow-${(markerId += 1)}`;
  const head = svg('marker', { id: marker, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' }, svg('defs', {}, drawing));
  svg('path', { d: 'M0 0L10 5L0 10z', fill: 'context-stroke' }, head);
  const box = (id: string): Box | null => {
    const el = step.querySelector(`[data-figure-id="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { el, l: r.left - frame.left, t: r.top - frame.top, r: r.right - frame.left, b: r.bottom - frame.top };
  };
  const stacked = new Map<string, number>();
  for (const link of links) {
    if (link.type === 'Arrow') {
      const a = box(link.from);
      const b = box(link.to);
      if (!a || !b) continue;
      let start: [number, number];
      let end: [number, number];
      if (b.l >= a.r - 1) [start, end] = [[a.r, (a.t + a.b) / 2], [b.l, (b.t + b.b) / 2]];
      else if (b.r <= a.l + 1) [start, end] = [[a.l, (a.t + a.b) / 2], [b.r, (b.t + b.b) / 2]];
      else if (b.t >= a.b - 1) [start, end] = [[(a.l + a.r) / 2, a.b], [(b.l + b.r) / 2, b.t]];
      else [start, end] = [[(a.l + a.r) / 2, a.t], [(b.l + b.r) / 2, b.b]];
      const path = svg('path', { d: `M${start[0]} ${start[1]}L${end[0]} ${end[1]}`, class: 'clew-figure-link', 'marker-end': `url(#${marker})` }, drawing);
      if (link.tag) path.dataset.tag = link.tag;
      if (link.label === undefined) continue;
      const label = layer.appendChild(div('clew-figure-link-label'));
      if (link.tag) label.dataset.tag = link.tag;
      label.style.left = `${(start[0] + end[0]) / 2}px`;
      label.style.top = `${(start[1] + end[1]) / 2}px`;
      markdown(label, link.label);
      continue;
    }
    const target = box(link.to);
    if (!target) continue;
    const k = stacked.get(link.to) ?? 0;
    stacked.set(link.to, k + 1);
    const pointer = layer.appendChild(div('clew-figure-pointer'));
    pointer.dataset.tag = link.tag ?? 'active';
    const name = createSpan();
    markdown(name, link.name);
    const arrow = (glyph: string): HTMLElement => Object.assign(div('clew-figure-pointer-mark'), { textContent: glyph });
    const table = target.el.closest('table');
    const tex = target.el.closest('.clew-figure-tex');
    if (table) {
      pointer.classList.add('is-left');
      pointer.append(name, arrow('→'));
      const left = table.getBoundingClientRect().left - frame.left;
      pointer.style.left = `${left - 4}px`;
      pointer.style.top = `${(target.t + target.b) / 2 + k * 18}px`;
    } else if (tex) {
      pointer.classList.add('is-right');
      pointer.append(arrow('←'), name);
      // Beside the formula itself: the Tex box also holds the room reserved for its pointers.
      pointer.style.left = `${(target.el.closest('mjx-container') ?? tex).getBoundingClientRect().right - frame.left + 8}px`;
      pointer.style.top = `${(target.t + target.b) / 2 + k * 18}px`;
    } else {
      pointer.append(arrow('↑'), name);
      pointer.style.left = `${(target.l + target.r) / 2}px`;
      pointer.style.top = `${target.b + 2 + k * 20}px`;
    }
  }
}
