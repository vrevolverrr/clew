import { angleMark, dimensionMark, rightAngleMark, tickMarks } from '@/renderer/figure/diagram/marks';
import { arrowHeads, div, svg } from '@/renderer/figure/dom';
import type { DiagramLayer, FigureNode, Point, Tag } from '@/renderer/figure/FigureData';
import { formatFigure } from '@/renderer/figure/formatFigure';
import { type LabelBox, placeLabels } from '@/renderer/figure/placeLabels';

type Diagram = Extract<FigureNode, { type: 'Diagram' }>;
export type Markdown = (el: HTMLElement, text: string | number) => void;

const PAD = 10;
const MAX_HEIGHT = 260;
const CHAR_WIDTH = 7.5;
/** More than the 2 px margin `placeLabels` counts a line crossing within. */
const LABEL_GAP = 3;

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

export type Extent = readonly [number, number, number, number];
/** Pixels a drawing reaches past its border on each side, for marks drawn off their points and labels pushed outside. */
export type Room = Readonly<{ left: number; top: number; right: number; bottom: number }>;

/**
 * What a Diagram shows, as [x0, y0, x1, y1]: what it drew, or the model's width and height when it drew nothing.
 * `keep` is an extent to keep, so a redraw stays anchored.
 */
export function diagramExtent(diagram: Diagram, keep?: Extent): Extent {
  const points = diagram.children.flatMap(pointsOf);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, y0, x1, y1] = points.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, diagram.width, diagram.height];
  // A single point has no size to scale to, so it gets a unit around it.
  const pad = x1 > x0 || y1 > y0 ? 0 : 1;
  const own: Extent = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  return keep ? [Math.min(own[0], keep[0]), Math.min(own[1], keep[1]), Math.max(own[2], keep[2]), Math.max(own[3], keep[3])] : own;
}

/**
 * Draws a Diagram showing `extent` within `available` pixels of width, y upwards, scaled to fit; call again after a resize.
 * Returns the room past the border this drawing needs; it keeps at least `keep`, so every step of a figure can share the most
 * any step needs and nothing moves between them.
 */
export function drawDiagram(el: HTMLElement, diagram: Diagram, extent: Extent, available: number, markdown: Markdown, keep?: Room): Room {
  el.replaceChildren();
  el.classList.add('clew-figure-diagram');
  const [x0, y0, x1, y1] = extent;
  available = Math.max(160, available) - 2 * PAD;
  const scale = Math.min(available / (x1 - x0), (MAX_HEIGHT - 2 * PAD) / (y1 - y0));
  const width = (x1 - x0) * scale + 2 * PAD;
  const height = (y1 - y0) * scale + 2 * PAD;
  const px = (p: Point): [number, number] => [PAD + (p[0] - x0) * scale, PAD + (y1 - p[1]) * scale];
  const units = (pixels: number): number => pixels / scale;

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' }, el);
  const head = arrowHeads(root, { markerUnits: 'userSpaceOnUse', markerWidth: 11, markerHeight: 11 });
  const lines: [number, number][][] = [];
  const labels: (LabelBox & { box: HTMLElement })[] = [];
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
  // Every label is drawn and then measured in one layout; one not laid out (no layout, or a render still running) keeps an estimate.
  const boxes = new Map<DiagramLayer, { box: HTMLElement; width: number; height: number }>();
  for (const layer of diagram.children) {
    const text = layer.type === 'Label' ? layer.text : 'label' in layer ? layer.label : undefined;
    if (text === undefined) continue;
    const box = el.appendChild(div('clew-figure-diagram-label'));
    if (layer.tag) box.style.color = `var(--clew-figure-tag-${layer.tag})`;
    if (layer.type === 'Shape' && layer.closed) box.classList.add('is-inside');
    markdown(box, text);
    boxes.set(layer, { box, width: formatFigure(text).length * CHAR_WIDTH + 8, height: 18 });
  }
  for (const size of boxes.values()) {
    const rect = size.box.getBoundingClientRect();
    if (rect.width) Object.assign(size, { width: rect.width, height: rect.height });
  }
  const label = (at: Point, layer: DiagramLayer, center = false): void => {
    const size = boxes.get(layer);
    if (!size) return;
    const [x, y] = px(at);
    labels.push({ x, y, width: size.width, height: size.height, box: size.box, center });
  };

  const all = diagram.children.flatMap(pointsOf);
  const centre: Point = all.length ? [all.reduce((sum, p) => sum + p[0], 0) / all.length, all.reduce((sum, p) => sum + p[1], 0) / all.length] : [(x0 + x1) / 2, (y0 + y1) / 2];
  for (const layer of diagram.children) {
    switch (layer.type) {
      case 'Shape': {
        polyline(layer.pts, layer.tag, layer.closed ? { class: 'is-closed' } : {}, layer.closed);
        if (layer.pts.length) {
          const middle: Point = [layer.pts.reduce((s, p) => s + p[0], 0) / layer.pts.length, layer.pts.reduce((s, p) => s + p[1], 0) / layer.pts.length];
          label(layer.closed ? middle : layer.pts[layer.pts.length - 1], layer, layer.closed);
        }
        break;
      }
      case 'Circle': {
        const [cx, cy] = px(layer.at);
        mark('circle', { cx, cy, r: layer.r * scale, fill: 'none' }, layer.tag);
        lines.push(Array.from({ length: 33 }, (_, i) => px([layer.at[0] + layer.r * Math.cos((i * Math.PI) / 16), layer.at[1] + layer.r * Math.sin((i * Math.PI) / 16)])));
        label([layer.at[0], layer.at[1] + layer.r], layer);
        break;
      }
      case 'Vector':
      case 'Segment':
        polyline([layer.from, layer.to], layer.tag, layer.type === 'Vector' ? { 'marker-end': head(layer.tag ? `var(--clew-figure-tag-${layer.tag})` : 'var(--clew-figure-ink)'), class: 'is-vector' } : {});
        label([(layer.from[0] + layer.to[0]) / 2, (layer.from[1] + layer.to[1]) / 2], layer);
        break;
      case 'Points':
        for (const p of layer.pts) {
          const [cx, cy] = px(p);
          mark('circle', { cx, cy, r: 3.5, class: 'is-point' }, layer.tag);
        }
        if (layer.pts.length) label(layer.pts[0], layer);
        break;
      case 'Label':
        label(layer.at, layer, true);
        break;
      case 'Angle': {
        const size = boxes.get(layer);
        const arc = angleMark(layer.at, layer.from, layer.to, units(22), size ? [units(size.width / 2), units(size.height / 2)] : undefined, units(LABEL_GAP));
        const points = Array.from({ length: 25 }, (_, i): Point => {
          const t = ((arc.start + ((arc.end - arc.start) * i) / 24) * Math.PI) / 180;
          return [layer.at[0] + arc.radius * Math.cos(t), layer.at[1] + arc.radius * Math.sin(t)];
        });
        polyline(points, layer.tag);
        label(arc.label, layer, true);
        break;
      }
      case 'RightAngle':
        polyline(rightAngleMark(layer.at, layer.from, layer.to, units(10)), layer.tag);
        break;
      case 'Tick':
        for (const tick of tickMarks(layer.on[0], layer.on[1], layer.n ?? 1, units(10), units(4))) polyline(tick, layer.tag);
        break;
      case 'Dimension': {
        // Offset away from the rest of the drawing, so the measure never lies across it.
        const [dx, dy] = [layer.to[0] - layer.from[0], layer.to[1] - layer.from[1]];
        const side = -dy * (centre[0] - (layer.from[0] + layer.to[0]) / 2) + dx * (centre[1] - (layer.from[1] + layer.to[1]) / 2) > 0 ? -1 : 1;
        const dimension = dimensionMark(layer.from, layer.to, side * units(16));
        polyline(dimension.line, layer.tag, { class: 'is-dimension' });
        for (const bar of dimension.bars) polyline(bar, layer.tag, { class: 'is-dimension' });
        label(dimension.label, layer, true);
        break;
      }
    }
  }

  // A mark drawn at a pixel offset from its points (a Dimension's line and bars) can reach past the border; the drawing grows to hold it.
  const xs = lines.flat().map((p) => p[0]);
  const ys = lines.flat().map((p) => p[1]);
  const left = Math.max(0, PAD - Math.min(PAD, ...xs));
  const top = Math.max(0, PAD - Math.min(PAD, ...ys));
  const right = Math.max(0, Math.max(width - PAD, ...xs) - width + PAD);
  const bottom = Math.max(0, Math.max(height - PAD, ...ys) - height + PAD);
  const marks = { x0: -left, y0: -top, x1: width + right, y1: height + bottom };
  // A label pushed past the top or bottom (one on a line along the edge) grows the drawing instead of covering the line.
  const spare = Math.max(0, ...labels.map((item) => item.height)) + LABEL_GAP * 2;
  const placed = placeLabels(labels, { ...marks, y0: marks.y0 - spare, y1: marks.y1 + spare }, lines);
  const needed: Room = {
    left,
    right,
    top: Math.max(top, -Math.min(0, ...placed.map((at) => at.y))),
    bottom: Math.max(bottom, Math.max(height, ...placed.map((at, i) => at.y + labels[i].height)) - height),
  };
  const frame = {
    x0: -Math.max(needed.left, keep?.left ?? 0),
    y0: -Math.max(needed.top, keep?.top ?? 0),
    x1: width + Math.max(needed.right, keep?.right ?? 0),
    y1: height + Math.max(needed.bottom, keep?.bottom ?? 0),
  };
  for (const [name, value] of Object.entries({ width: frame.x1 - frame.x0, height: frame.y1 - frame.y0, viewBox: `${frame.x0} ${frame.y0} ${frame.x1 - frame.x0} ${frame.y1 - frame.y0}` })) root.setAttribute(name, String(value));
  placed.forEach((at, i) => {
    labels[i].box.style.left = `${at.x - frame.x0}px`;
    labels[i].box.style.top = `${at.y - frame.y0}px`;
  });
  const shown = new Set(labels.map((item) => item.box));
  for (const { box } of boxes.values()) if (!shown.has(box)) box.remove();
  el.style.width = `${frame.x1 - frame.x0}px`;
  el.style.height = `${frame.y1 - frame.y0}px`;
  return needed;
}
