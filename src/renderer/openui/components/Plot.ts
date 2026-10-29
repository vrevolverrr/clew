import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { dataComponent, type ComponentFactory } from '../OpenUIRenderer';
import { type Layer, PlotChart, type PlotModel, type Point } from '@/renderer/figure/plot/PlotChart';

const pointList = z.array(z.array(z.number().nullable()));
const seriesProp = z.number().optional();

export const Line = defineComponent({
  name: 'Line',
  description: 'A curve through points, such as @Curve(...), joined by straight segments. A line of 12 or fewer points marks each point. A label adds it to the legend and the hover. The same series number gives the same colour.',
  props: z.object({ points: pointList, label: z.string().optional(), series: seriesProp }),
  component: dataComponent,
});

export const Area = defineComponent({
  name: 'Area',
  description:
    'The region between points and a base, shaded. The base is a number (default 0) or a second curve, to shade the gap between two curves; from and to limit the shading to that x range. Between two curves, set from and to where one stays above the other, as the shading is not signed. A label adds it to the legend. Use it for a tail, a total or a named region.',
  props: z.object({ points: pointList, label: z.string().optional(), series: seriesProp, base: z.union([z.number(), pointList]).optional(), from: z.number().optional(), to: z.number().optional() }),
  component: dataComponent,
});

export const Bars = defineComponent({
  name: 'Bars',
  description:
    'One bar for each category named in Plot. mode "waterfall": values are changes; the first bar and each null stand on the baseline and show the running total.',
  props: z.object({ values: z.array(z.number().nullable()), mode: z.enum(['bars', 'waterfall']).optional(), label: z.string().optional(), series: seriesProp }),
  component: dataComponent,
});

export const Dot = defineComponent({
  name: 'Dot',
  description: 'A marked point, with an optional label beside it.',
  props: z.object({ x: z.number(), y: z.number(), label: z.string().optional(), series: seriesProp }),
  component: dataComponent,
});

export const Rule = defineComponent({
  name: 'Rule',
  description: 'A vertical line at x (axis "x", the default) or a horizontal line at y (axis "y"), with an optional label.',
  props: z.object({ at: z.number(), axis: z.enum(['x', 'y']).optional(), label: z.string().optional(), series: seriesProp }),
  component: dataComponent,
});

export const Note = defineComponent({
  name: 'Note',
  description: 'Text centred just above a point of the plot. To mark a point on a curve, use Dot with a label instead.',
  props: z.object({ x: z.number(), y: z.number(), text: z.string() }),
  component: dataComponent,
});

const range = z.array(z.number());

export const Plot = defineComponent({
  name: 'Plot',
  description:
    'Axes with layers. x is [from, to], or category names for Bars. y is [low, high]; leave it out to fit the data, but give it when a curve runs off the screen.',
  props: z.object({
    x: z.union([range, z.array(z.string())]),
    layers: z.array(z.union([Line.ref, Area.ref, Bars.ref, Dot.ref, Rule.ref, Note.ref])),
    y: range.optional(),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
  }),
  component: (() => {
    const el = document.createElement('div');
    const chart = new PlotChart(el);
    return {
      el,
      update: (props) => chart.render(toModel(props)),
      destroy: () => chart.destroy(),
    };
  }) satisfies ComponentFactory,
});

const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const series = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.round(v)) : undefined);
const bound = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const points = (v: unknown): Point[] =>
  (Array.isArray(v) ? v : []).flatMap((p): Point[] =>
    Array.isArray(p) && typeof p[0] === 'number' ? [[p[0], typeof p[1] === 'number' ? p[1] : null]] : [],
  );

/** Reads the layers a model wrote, skipping any that are partial or malformed, so a half-streamed plot still draws. */
function toModel(props: Record<string, unknown>): PlotModel {
  const x = Array.isArray(props.x) && props.x.every((v) => typeof v === 'string') && props.x.length
    ? (props.x as string[])
    : ([num((props.x as unknown[] | undefined)?.[0]), num((props.x as unknown[] | undefined)?.[1], 1)] as [number, number]);
  const y = Array.isArray(props.y) && props.y.length === 2 ? ([num(props.y[0]), num(props.y[1], 1)] as [number, number]) : undefined;
  const layers: Layer[] = [];
  for (const node of Array.isArray(props.layers) ? props.layers : []) {
    const p = (node as { props?: Record<string, unknown> } | null)?.props;
    if (!p) continue;
    const common = { label: text(p.label), series: series(p.series) };
    switch ((node as { typeName: string }).typeName) {
      case 'Line': layers.push({ kind: 'line', points: points(p.points), ...common }); break;
      case 'Area': layers.push({ kind: 'area', points: points(p.points), base: num(p.base), lower: Array.isArray(p.base) ? points(p.base) : undefined, from: bound(p.from), to: bound(p.to), ...common }); break;
      case 'Bars': layers.push({ kind: 'bars', values: (Array.isArray(p.values) ? p.values : []).map((v) => (typeof v === 'number' ? v : null)), mode: p.mode === 'waterfall' ? 'waterfall' : 'bars', ...common }); break;
      case 'Dot': layers.push({ kind: 'dot', x: num(p.x), y: num(p.y), ...common }); break;
      case 'Rule': layers.push({ kind: 'rule', at: num(p.at), axis: p.axis === 'y' ? 'y' : 'x', ...common }); break;
      case 'Note': layers.push({ kind: 'note', x: num(p.x), y: num(p.y), text: String(p.text ?? '') }); break;
    }
  }
  return { x, y, xLabel: text(props.xLabel), yLabel: text(props.yLabel), layers };
}
