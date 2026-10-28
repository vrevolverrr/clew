import { mixModel, modelDistance } from '@/renderer/openui/plot/mixModel';
import type { Layer, PlotModel } from '@/renderer/openui/plot/PlotChart';

const model = (layers: Layer[], x: PlotModel['x'] = [0, 10], y: [number, number] = [0, 10]): PlotModel & { y: [number, number] } => ({ x, y, layers });

describe('mixModel', () => {
  it('moves each number part of the way from the old plot to the new one', () => {
    const a = model([{ kind: 'line', points: [[0, 0], [10, 10]], label: 'old' }]);
    const b = model([{ kind: 'line', points: [[0, 4], [10, 0]], label: 'new' }], [0, 20], [0, 20]);

    const mixed = mixModel(a, b, 0.5)!;

    expect(mixed.layers[0]).toEqual({ kind: 'line', points: [[0, 2], [10, 5]], label: 'new', series: undefined });
    expect(mixed.x).toEqual([0, 15]);
    expect(mixed.y).toEqual([0, 15]);
  });

  it('is the old plot at 0 and the new one at 1', () => {
    const a = model([{ kind: 'dot', x: 1, y: 2 }]);
    const b = model([{ kind: 'dot', x: 3, y: 8 }]);

    expect(mixModel(a, b, 0)!.layers[0]).toEqual(a.layers[0]);
    expect(mixModel(a, b, 1)!.layers[0]).toEqual(b.layers[0]);
  });

  it('takes the new value where either side is a gap', () => {
    const a = model([{ kind: 'line', points: [[0, 1], [1, null], [2, 3]] }]);
    const b = model([{ kind: 'line', points: [[0, null], [1, 5], [2, 7]] }]);

    const layer = mixModel(a, b, 0.5)!.layers[0] as Extract<Layer, { kind: 'line' }>;

    expect(layer.points).toEqual([[0, null], [1, 5], [2, 5]]);
  });

  it('moves bars, rules, areas and notes', () => {
    const a = model([
      { kind: 'bars', values: [0, 10, null], mode: 'waterfall' },
      { kind: 'rule', at: 2, axis: 'x' },
      { kind: 'area', points: [[0, 0]], base: 0 },
      { kind: 'note', x: 0, y: 0, text: 'a' },
    ]);
    const b = model([
      { kind: 'bars', values: [10, 0, null], mode: 'waterfall' },
      { kind: 'rule', at: 4, axis: 'x' },
      { kind: 'area', points: [[0, 8]], base: 2 },
      { kind: 'note', x: 4, y: 4, text: 'b' },
    ]);

    const layers = mixModel(a, b, 0.5)!.layers;

    expect(layers[0]).toMatchObject({ values: [5, 5, null] });
    expect(layers[1]).toMatchObject({ at: 3 });
    expect(layers[2]).toMatchObject({ points: [[0, 4]], base: 1 });
    expect(layers[3]).toMatchObject({ x: 2, y: 2, text: 'b' });
  });

  it.each([
    ['a layer added', model([{ kind: 'dot', x: 0, y: 0 }]), model([{ kind: 'dot', x: 0, y: 0 }, { kind: 'dot', x: 1, y: 1 }])],
    ['a layer of another kind', model([{ kind: 'dot', x: 0, y: 0 }]), model([{ kind: 'note', x: 0, y: 0, text: '' }])],
    ['a different number of points', model([{ kind: 'line', points: [[0, 0]] }]), model([{ kind: 'line', points: [[0, 0], [1, 1]] }])],
    ['other categories', model([], ['a', 'b']), model([], ['a', 'c'])],
    ['categories for a range', model([], ['a']), model([])],
  ])('gives up on %s, so the plot jumps', (_name, a, b) => {
    expect(mixModel(a, b, 0.5)).toBeNull();
  });
});

describe('modelDistance', () => {
  it('is zero for the same plot and grows with the change as a share of the axes', () => {
    const a = model([{ kind: 'line', points: [[0, 0], [10, 0]] }]);
    const same = model([{ kind: 'line', points: [[0, 0], [10, 0]] }]);
    const moved = model([{ kind: 'line', points: [[0, 0], [10, 5]] }]);

    expect(modelDistance(a, same)).toBe(0);
    expect(modelDistance(a, moved)).toBeCloseTo(0.5);
  });

  it('moves the second curve and the shaded range of an area', () => {
    const a = model([{ kind: 'area', points: [[0, 4]], base: 0, lower: [[0, 0]], from: 0, to: 2 }]);
    const b = model([{ kind: 'area', points: [[0, 8]], base: 0, lower: [[0, 2]], from: 2, to: 4 }]);

    const layer = mixModel(a, b, 0.5)!.layers[0] as Extract<Layer, { kind: 'area' }>;

    expect(layer).toMatchObject({ points: [[0, 6]], lower: [[0, 1]], from: 1, to: 3 });
  });

  it('does not mix an area shaded against a curve with one shaded against a baseline', () => {
    const a = model([{ kind: 'area', points: [[0, 4]], base: 0 }]);
    const b = model([{ kind: 'area', points: [[0, 4]], base: 0, lower: [[0, 0]] }]);

    expect(mixModel(a, b, 0.5)).toBeNull();
  });
});
