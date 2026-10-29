import { plotModel } from '@/renderer/figure/drawPlot';
import type { FigureNode } from '@/renderer/figure/FigureData';

const sampled = (f: (x: number) => number, from: number, to: number): [number, number | null][] =>
  Array.from({ length: 161 }, (_, i) => {
    const x = from + ((to - from) * i) / 160;
    const y = f(x);
    return [x, Number.isFinite(y) ? y : null];
  });

const linePoints = (fn: (x: number) => number, from: number, to: number, y: [number, number]): [number, number | null][] => {
  const plot: Extract<FigureNode, { type: 'Plot' }> = { type: 'Plot', x: [from, to], y, children: [{ type: 'Fn', pts: sampled(fn, from, to) }] };
  const layer = plotModel(plot).layers[0];
  if (layer.kind !== 'line') throw new Error('expected a line');
  return layer.points;
};

describe('the Fn jump rule', () => {
  it('breaks tan at each asymptote in [-3, 3]', () => {
    const points = linePoints(Math.tan, -3, 3, [-5, 5]);
    const breaks = points.filter(([, y]) => y === null).map(([x]) => x);
    expect(breaks).toHaveLength(2);
    expect(breaks[0]).toBeCloseTo(-Math.PI / 2, 1);
    expect(breaks[1]).toBeCloseTo(Math.PI / 2, 1);
  });

  it('keeps the vertical of a step function that stays in the box', () => {
    const points = linePoints((x) => (x < 0 ? -1 : 1), -2, 2, [-2, 2]);
    expect(points.some(([, y]) => y === null)).toBe(false);
  });
});
