import { angleMark, dimensionMark, rightAngleMark, tickMarks } from '@/renderer/figure/diagram/marks';
import { div, svg } from '@/renderer/figure/dom';
import type { DiagramLayer, FigureNode, Point, Tag } from '@/renderer/figure/FigureData';
import { formatFigure } from '@/renderer/figure/formatFigure';
import { type LabelBox, placeLabels } from '@/renderer/figure/placeLabels';

type Diagram = Extract<FigureNode, { type: 'Diagram' }>;
export type Markdown = (el: HTMLElement, text: string | number) => void;

const PAD = 28;
const MAX_HEIGHT = 360;
const FALLBACK_WIDTH = 480;
const CHAR_WIDTH = 7.5;
let markerId = 0;

function pointsOf(layer: DiagramLayer): readonly Point[] {
  switch (layer.type) {
    case 'Shape':
    case 'Points':
      return layer.pts;
    case 'Circle':
      return [[layer.at[0] - layer.r, layer.at[1] - layer.r], [layer.at[0] + layer.r, layer.at[1] + layer.r]];
    case 'Label':
      return [layer.at];
    case 'Tick':
      return layer.on;
    default:
      return 'at' in layer ? [layer.at, layer.from, layer.to] : [layer.from, layer.to];
  }
}

/** The model's own extent, or the extent of what it drew when that spills out of it (a drawing centred on the origin). */
function domain(diagram: Diagram): [number, number, number, number] {
  const points = diagram.children.flatMap(pointsOf);
  const inside = points.every(([x, y]) => x >= -1e-9 && y >= -1e-9 && x <= diagram.width + 1e-9 && y <= diagram.height + 1e-9);
  if (inside || !points.length) return [0, 0, diagram.width, diagram.height];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = Math.max(x1 - x0, y1 - y0) * 0.05 || 1;
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

/** Draws a Diagram at the width `el` has, y upwards, scaled to fit; call again after a resize. */
export function drawDiagram(el: HTMLElement, diagram: Diagram, markdown: Markdown): void {
  el.replaceChildren();
  el.classList.add('clew-figure-diagram');
  const [x0, y0, x1, y1] = domain(diagram);
  const available = Math.max(160, el.clientWidth || FALLBACK_WIDTH) - 2 * PAD;
  const scale = Math.min(available / (x1 - x0), (MAX_HEIGHT - 2 * PAD) / (y1 - y0));
  const width = (x1 - x0) * scale + 2 * PAD;
  const height = (y1 - y0) * scale + 2 * PAD;
  const px = (p: Point): [number, number] => [PAD + (p[0] - x0) * scale, PAD + (y1 - p[1]) * scale];
  const units = (pixels: number): number => pixels / scale;

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' }, el);
  const marker = `clew-figure-diagram-arrow-${(markerId += 1)}`;
  const head = svg('marker', { id: marker, viewBox: '0 0 10 10', refX: 9, refY: 5, markerUnits: 'userSpaceOnUse', markerWidth: 11, markerHeight: 11, orient: 'auto-start-reverse' }, svg('defs', {}, root));
  svg('path', { d: 'M0 0L10 5L0 10z', fill: 'context-stroke' }, head);
  const lines: [number, number][][] = [];
  const labels: (LabelBox & { text: string | number; tag?: Tag })[] = [];
  const mark = (tag: string, attrs: Record<string, string | number>, layerTag?: Tag): SVGElement => {
    const shape = svg(tag, { ...attrs, class: `clew-figure-mark${attrs.class ? ` ${attrs.class}` : ''}` }, root);
    if (layerTag) shape.style.color = `var(--clew-figure-tag-${layerTag})`;
    return shape;
  };
  const path = (points: readonly Point[], close = false): string => `M${points.map((p) => px(p).map((v) => v.toFixed(1)).join(',')).join('L')}${close ? 'Z' : ''}`;
  const polyline = (points: readonly Point[], tag?: Tag, extra: Record<string, string | number> = {}, close = false): void => {
    if (points.length < 2) return;
    mark('path', { d: path(points, close), fill: 'none', ...extra }, tag);
    lines.push((close ? [...points, points[0]] : points).map(px));
  };
  const label = (at: Point, text: string | number | undefined, tag?: Tag, center = false): void => {
    if (text === undefined) return;
    const [x, y] = px(at);
    labels.push({ x, y, width: formatFigure(text).length * CHAR_WIDTH + 8, height: 18, text, tag, center });
  };

  for (const layer of diagram.children) {
    switch (layer.type) {
      case 'Shape': {
        polyline(layer.pts, layer.tag, layer.closed ? { class: 'is-closed' } : {}, layer.closed);
        if (layer.pts.length) {
          const centre: Point = [layer.pts.reduce((s, p) => s + p[0], 0) / layer.pts.length, layer.pts.reduce((s, p) => s + p[1], 0) / layer.pts.length];
          label(layer.closed ? centre : layer.pts[layer.pts.length - 1], layer.label, layer.tag, layer.closed);
        }
        break;
      }
      case 'Circle': {
        const [cx, cy] = px(layer.at);
        mark('circle', { cx, cy, r: layer.r * scale, fill: 'none' }, layer.tag);
        lines.push(Array.from({ length: 33 }, (_, i) => px([layer.at[0] + layer.r * Math.cos((i * Math.PI) / 16), layer.at[1] + layer.r * Math.sin((i * Math.PI) / 16)])));
        label([layer.at[0], layer.at[1] + layer.r], layer.label, layer.tag);
        break;
      }
      case 'Vector':
      case 'Segment':
        polyline([layer.from, layer.to], layer.tag, layer.type === 'Vector' ? { 'marker-end': `url(#${marker})`, class: 'is-vector' } : {});
        label([(layer.from[0] + layer.to[0]) / 2, (layer.from[1] + layer.to[1]) / 2], layer.label, layer.tag);
        break;
      case 'Points':
        for (const p of layer.pts) {
          const [cx, cy] = px(p);
          mark('circle', { cx, cy, r: 3.5, class: 'is-point' }, layer.tag);
        }
        if (layer.pts.length) label(layer.pts[0], layer.label, layer.tag);
        break;
      case 'Label':
        label(layer.at, layer.text, layer.tag, true);
        break;
      case 'Angle': {
        const arc = angleMark(layer.at, layer.from, layer.to, units(22));
        const points = Array.from({ length: 25 }, (_, i): Point => {
          const t = ((arc.start + ((arc.end - arc.start) * i) / 24) * Math.PI) / 180;
          return [layer.at[0] + arc.radius * Math.cos(t), layer.at[1] + arc.radius * Math.sin(t)];
        });
        polyline(points, layer.tag);
        label(arc.label, layer.label, layer.tag, true);
        break;
      }
      case 'RightAngle':
        polyline(rightAngleMark(layer.at, layer.from, layer.to, units(10)), layer.tag);
        break;
      case 'Tick':
        for (const tick of tickMarks(layer.on[0], layer.on[1], layer.n ?? 1, units(10), units(4))) polyline(tick, layer.tag);
        break;
      case 'Dimension': {
        const dimension = dimensionMark(layer.from, layer.to, units(16));
        polyline(dimension.line, layer.tag, { class: 'is-dimension' });
        for (const bar of dimension.bars) polyline(bar, layer.tag, { class: 'is-dimension' });
        label(dimension.label, layer.label, layer.tag, true);
        break;
      }
    }
  }

  placeLabels(labels, { x0: 0, y0: 0, x1: width, y1: height }, lines).forEach((at, i) => {
    const { text, tag } = labels[i];
    const box = el.appendChild(div('clew-figure-diagram-label'));
    box.style.left = `${at.x}px`;
    box.style.top = `${at.y}px`;
    if (tag) box.style.color = `var(--clew-figure-tag-${tag})`;
    markdown(box, text);
  });
  el.style.height = `${height}px`;
}
