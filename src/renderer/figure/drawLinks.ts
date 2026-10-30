import { arrowHeads, div, lineInk, svg } from '@/renderer/figure/dom';
import type { FigureNode } from '@/renderer/figure/FigureData';

export type Link = Extract<FigureNode, { type: 'Arrow' | 'Pointer' }>;
type Box = { el: Element; l: number; t: number; r: number; b: number };

/** Draws a step's arrows and pointers over it, from the boxes of the elements they name; call again after anything moves. */
export function drawLinks(step: HTMLElement, links: readonly Link[], markdown: (el: HTMLElement, text: string | number) => void): void {
  step.querySelector(':scope > .clew-figure-links')?.remove();
  if (!links.length) return;
  const layer = step.appendChild(div('clew-figure-links'));
  layer.setAttribute('aria-hidden', 'true');
  const frame = step.getBoundingClientRect();
  const drawing = svg('svg', { class: 'clew-figure-links-svg', width: frame.width, height: frame.height }, layer);
  const head = arrowHeads(drawing, { markerWidth: 8, markerHeight: 8 });
  const box = (id: string): Box | null => {
    const el = step.querySelector(`[data-figure-id="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { el, l: r.left - frame.left, t: r.top - frame.top, r: r.right - frame.left, b: r.bottom - frame.top };
  };
  // Pointers stack per lane and line: two anchors on one formula line or one table row share a spot otherwise.
  const stacked = new Map<Element, Map<number, number>>();
  const grow = new Map<HTMLElement, number>();
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
      const path = svg('path', { d: `M${start[0]} ${start[1]}L${end[0]} ${end[1]}`, class: 'clew-figure-link', 'marker-end': head(lineInk(link.tag)) }, drawing);
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
    const table = target.el.closest('table');
    const tex = target.el.closest('.clew-figure-tex');
    const owner = table ?? tex ?? target.el;
    const lane = stacked.get(owner) ?? new Map<number, number>();
    stacked.set(owner, lane);
    const line = Math.round(table || tex ? (target.t + target.b) / 2 : target.b);
    const k = lane.get(line) ?? 0;
    lane.set(line, k + 1);
    const pointer = layer.appendChild(div('clew-figure-pointer'));
    pointer.dataset.tag = link.tag ?? 'active';
    const name = createSpan();
    markdown(name, link.name);
    const arrow = (glyph: string): HTMLElement => Object.assign(div('clew-figure-pointer-mark'), { textContent: glyph });
    if (table) {
      pointer.classList.add('is-left');
      pointer.append(name, arrow('→'));
      const left = table.getBoundingClientRect().left - frame.left;
      pointer.style.left = `${left - 4}px`;
      pointer.style.top = `${(target.t + target.b) / 2 + k * 18}px`;
    } else if (tex) {
      pointer.classList.add('is-right', 'is-tex');
      pointer.append(arrow('←'), name);
      // Beside the typeset formula itself: its container spans the whole Tex box, which also holds the room reserved for pointers.
      // A pointer can name the Tex itself, which holds the formula rather than sitting in it.
      const container = target.el.closest('mjx-container') ?? tex.querySelector('mjx-container');
      const formula = (container?.querySelector(':scope > mjx-math, :scope > svg') ?? container ?? tex).getBoundingClientRect().right;
      pointer.style.left = `${formula - frame.left + 8}px`;
      // The room reserved for pointers is estimated from their source; a typeset name can be wider, so the Tex box grows to hold it.
      // Measured from the formula, not the box, so a box that cannot widen does not grow again on every call.
      const room = pointer.getBoundingClientRect().right - formula + 4;
      if (tex.instanceOf(HTMLElement)) grow.set(tex, Math.max(grow.get(tex) ?? 0, room));
      pointer.style.top = `${(target.t + target.b) / 2 + k * 18}px`;
    } else {
      pointer.append(arrow('↑'), name);
      pointer.style.left = `${(target.l + target.r) / 2}px`;
      pointer.style.top = `${target.b + 2 + k * 20}px`;
    }
  }
  for (const [el, room] of grow) if (room > parseFloat(getComputedStyle(el).paddingRight)) el.style.paddingInline = `${room}px`;
}
