import type { FigureNode } from '@/renderer/figure/FigureData';
import { formatFigure } from '@/renderer/figure/formatFigure';
import type { Layer, PlotModel, Point } from '@/renderer/figure/plot/PlotChart';

type Plot = Extract<FigureNode, { type: 'Plot' }>;

const CIRCLE_POINTS = 96;

/** The `PlotChart` model of a figure's Plot. */
export function plotModel(plot: Plot): PlotModel {
  const fns = new Map(plot.children.flatMap((layer) => (layer.type === 'Fn' && layer.id ? [[layer.id, layer] as const] : [])));
  const box = plot.y ?? finiteRange(plot.children.flatMap((layer) => (layer.type === 'Fn' ? layer.pts.map((p) => p[1]) : [])));
  const curve = (id: string): Point[] => breakJumps(fns.get(id)!.pts.map(([x, y]): Point => [x, y]), box);
  const layers = plot.children.flatMap((layer): Layer[] => {
    const marks = { ...(layer.tag ? { tag: layer.tag } : {}) };
    const label = 'label' in layer && layer.label !== undefined ? formatFigure(layer.label) : undefined;
    switch (layer.type) {
      case 'Fn':
        return [{ kind: 'line', points: breakJumps(layer.pts.map(([x, y]): Point => [x, y]), box), label, ...marks }];
      case 'Region': {
        const from = layer.from ?? plot.x[0];
        const to = layer.to ?? plot.x[1];
        const top = typeof layer.top === 'string' ? curve(layer.top) : ([[from, layer.top], [to, layer.top]] as Point[]);
        const lower = typeof layer.base === 'string' ? curve(layer.base) : undefined;
        return [{ kind: 'area', points: top, base: typeof layer.base === 'number' ? layer.base : 0, ...(lower ? { lower } : {}), from, to, label, ...marks }];
      }
      case 'Shape': {
        const pts = layer.pts.map(([x, y]): Point => [x, y]);
        return pts.length < 2 ? [] : [{ kind: 'line', points: layer.closed ? [...pts, pts[0]] : pts, label, ...marks }];
      }
      case 'Circle':
        return [{ kind: 'line', points: circle(layer.at, layer.r), label, ...marks }];
      case 'Vector':
        return [{ kind: 'arrow', from: [...layer.from], to: [...layer.to], label, ...marks }];
      case 'Segment':
        return [{ kind: 'line', points: [[...layer.from], [...layer.to]], label, ...marks }];
      case 'Points':
        return layer.pts.map(([x, y], i): Layer => ({ kind: 'dot', x, y, label: i === 0 ? label : undefined, ...marks }));
      case 'Label':
        return [{ kind: 'note', x: layer.at[0], y: layer.at[1], text: formatFigure(layer.text), ...marks }];
    }
    return [];
  });
  return { x: [plot.x[0], plot.x[1]], ...(plot.y ? { y: [plot.y[0], plot.y[1]] } : {}), xLabel: plot.xLabel, yLabel: plot.yLabel, layers };
}

function circle(at: readonly [number, number], r: number): Point[] {
  return Array.from({ length: CIRCLE_POINTS + 1 }, (_, i) => {
    const t = (2 * Math.PI * i) / CIRCLE_POINTS;
    return [at[0] + r * Math.cos(t), at[1] + r * Math.sin(t)];
  });
}

function finiteRange(values: readonly (number | null)[]): readonly [number, number] {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return finite.length ? [Math.min(...finite), Math.max(...finite)] : [0, 1];
}

/**
 * A sampled curve that leaves the box through one edge and comes back through the other with a change of sign, as
 * `tan` and `1/x` do at an asymptote, gets a break there instead of a vertical line. A jump that stays in the box is kept.
 */
export function breakJumps(points: readonly Point[], [y0, y1]: readonly [number, number]): Point[] {
  const out: Point[] = [];
  points.forEach((point, i) => {
    const before = points[i - 1];
    const a = before?.[1];
    const b = point[1];
    if (a !== undefined && a !== null && b !== null) {
      const outside = a > y1 || a < y0 || b > y1 || b < y0;
      if (outside && Math.sign(a) !== Math.sign(b) && Math.abs(b - a) > y1 - y0) out.push([(before[0] + point[0]) / 2, null]);
    }
    out.push(point);
  });
  return out;
}
