import { renderMath } from 'obsidian';
import type { MathResolver } from 'pele';

const ELEMENTS = new Set(['svg', 'g', 'defs', 'path', 'use', 'rect', 'line', 'circle', 'ellipse', 'polygon', 'polyline']);
const ATTRIBUTES = new Set([
  'viewBox', 'width', 'height', 'd', 'transform', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'rx', 'ry', 'cx', 'cy', 'r', 'points', 'xmlns', 'xmlns:xlink', 'preserveAspectRatio',
  'role', 'focusable', 'aria-hidden', 'data-c', 'data-mml-node',
]);
const GLYPH_ID = /^MJX[-\w]*$/;
const GLYPH_REF = /^#MJX[-\w]*$/;

/**
 * Pele puts this markup into the diagram as written, and the formula comes from model output, whose TeX can ask
 * MathJax for links, styles and classes. Keeps drawing elements and plain attributes, drops the rest of the attributes,
 * and returns false for any other element, any `url(...)`, and any reference that leaves the formula's own glyphs.
 */
function reduceToDrawing(svg: SVGElement): boolean {
  for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
    if (!ELEMENTS.has(el.localName)) return false;
    for (const { name, value } of Array.from(el.attributes)) {
      if (/url\s*\(/i.test(value)) return false;
      if (name === 'href' || name === 'xlink:href') {
        if (el.localName !== 'use' || !GLYPH_REF.test(value)) return false;
      } else if (name === 'id' ? !GLYPH_ID.test(value) : !ATTRIBUTES.has(name)) {
        el.removeAttribute(name);
      }
    }
  }
  return true;
}

/**
 * Draws a `$$...$$` span of a diagram label with Obsidian's own maths renderer. Pele lays the diagram out
 * synchronously and needs each formula's size first, so the formula is drawn off screen and measured there.
 * `null` leaves the span as text.
 */
export const diagramMath: MathResolver = (tex, size) => {
  const holder = document.body.createDiv();
  Object.assign(holder.style, { position: 'absolute', visibility: 'hidden', fontSize: `${size}px` });
  try {
    holder.append(renderMath(tex, false));
    const svg = holder.querySelector('svg');
    if (!svg) return null;
    const { width, height } = svg.getBoundingClientRect();
    if (!width || !height || !reduceToDrawing(svg)) return null;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    return { svg: svg.outerHTML, width, height };
  } catch {
    return null;
  } finally {
    holder.remove();
  }
};
