import { arrowHeads, div, lineInk, svg } from '@/renderer/figure/dom';
import type { FigureNode } from '@/renderer/figure/FigureData';

export type Link = Extract<FigureNode, { type: 'Arrow' | 'Pointer' }>;
type Box = { el: Element; l: number; t: number; r: number; b: number };
type Markdown = (el: HTMLElement, text: string | number) => void;

/** A pointer is 20 px tall; the next one down sits this far below it. */
export const POINTER_STEP = 22;

/** A pointer's arrow and name, the arrow first unless the pointer stands left of what it points at. */
export function pointerLabel(name: string | number, arrow: string, markdown: Markdown, nameFirst = false): HTMLElement {
  const label = div('clew-figure-pointer');
  const text = createSpan();
  markdown(text, name);
  const mark = Object.assign(div('clew-figure-pointer-mark'), { textContent: arrow });
  label.append(...(nameFirst ? [text, mark] : [mark, text]));
  return label;
}

/**
 * Draws a step's arrows and pointers over it, from the boxes of the elements they name; call again after anything moves.
 * A pointer into a Tex goes in that Tex's pointer column instead.
 */
export function drawLinks(step: HTMLElement, links: readonly Link[], markdown: Markdown): void {
  step.querySelector(':scope > .clew-figure-links')?.remove();
  for (const old of step.querySelectorAll('.clew-figure-tex-lane > .clew-figure-pointer')) old.remove();
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
  // Each Table, Tex or Seq item's pointers so far: one that would cover another moves down past it.
  const taken = new Map<Element, number[]>();
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
    const column = tex?.querySelector<HTMLElement>(':scope > .clew-figure-tex-lane');
    const owner = table ?? tex ?? target.el;
    const tops = taken.get(owner) ?? [];
    taken.set(owner, tops);
    let top = table || tex ? (target.t + target.b) / 2 : target.b + 2;
    for (let hit = tops.find((t) => Math.abs(t - top) < POINTER_STEP); hit !== undefined; hit = tops.find((t) => Math.abs(t - top) < POINTER_STEP)) top = hit + POINTER_STEP;
    tops.push(top);
    let pointer: HTMLElement;
    if (table) {
      pointer = layer.appendChild(pointerLabel(link.name, '→', markdown, true));
      pointer.classList.add('is-left');
      pointer.style.left = `${table.getBoundingClientRect().left - frame.left - 4}px`;
      pointer.style.top = `${top}px`;
    } else if (column) {
      pointer = column.appendChild(pointerLabel(link.name, '←', markdown));
      pointer.style.top = `${top - (column.getBoundingClientRect().top - frame.top)}px`;
    } else {
      pointer = layer.appendChild(pointerLabel(link.name, '↑', markdown));
      pointer.style.left = `${(target.l + target.r) / 2}px`;
      pointer.style.top = `${top}px`;
    }
    pointer.dataset.tag = link.tag ?? 'active';
  }
}
