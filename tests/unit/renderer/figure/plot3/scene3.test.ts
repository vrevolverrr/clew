import type { Plot3Layer, Plot3Model, Point3, View } from '@/renderer/figure/FigureData';
import { clipLine, meshOf, paintOrder, projection, scene3, textWidth, type Colours, type TextBox } from '@/renderer/figure/plot3/scene3';

import { depthErrors } from '../../../../depthErrors';

const SIDE = 49;
const SIZE = { width: 480, height: 320 };
const COLOURS: Colours = { ramp: [[0, 0, 0], [255, 255, 255]] };

const graph = (f: (x: number, y: number) => number | null, x: [number, number] = [-1, 1], y: [number, number] = [-1, 1]): Plot3Layer => ({
  type: 'Fn', x, y,
  zs: Array.from({ length: SIDE * SIDE }, (_, k) => f(x[0] + ((x[1] - x[0]) * (k % SIDE)) / 48, y[0] + ((y[1] - y[0]) * Math.floor(k / SIDE)) / 48)),
});
const sphere: Plot3Layer = {
  type: 'Fn',
  pts: Array.from({ length: SIDE * SIDE }, (_, k): Point3 => {
    const u = ((k % SIDE) / 48) * 2 * Math.PI;
    const v = (Math.floor(k / SIDE) / 48) * Math.PI;
    return [Math.cos(u) * Math.sin(v), Math.sin(u) * Math.sin(v), Math.cos(v)];
  }),
};
const model = (children: Plot3Layer[], more: Partial<Plot3Model> = {}): Plot3Model => ({ x: [-1, 1], y: [-1, 1], z: [0, 1], equal: false, view: { azimuth: 30, elevation: 25 }, children, ...more });

describe('projection', () => {
  it('draws x to the right and z up from the side, and y up from above', () => {
    const side = projection(model([]), { azimuth: 0, elevation: 0 }, SIZE);
    const [o, x, y, z] = [side([0, 0, 0]), side([0.5, 0, 0]), side([0, 0.5, 0]), side([0, 0, 0.5])];
    expect(x[0]).toBeGreaterThan(o[0]);
    expect(x[1]).toBeCloseTo(o[1]);
    expect(y).toEqual(o);
    expect(z[1]).toBeLessThan(o[1]);
    const top = projection(model([]), { azimuth: 0, elevation: 89 }, SIZE);
    expect(top([0, 0.5, 0])[1]).toBeLessThan(top([0, 0, 0])[1] - 0.99 * (o[1] - z[1]));
  });

  it('keeps one scale at every angle, so turning never zooms', () => {
    const length = (view: View, end: Point3): number => {
      const p = projection(model([]), view, SIZE);
      const [c, q] = [p([0, 0, 0]), p(end)];
      return Math.hypot(q[0] - c[0], q[1] - c[1]);
    };
    expect(length({ azimuth: 90, elevation: 0 }, [0, 0.5, 0])).toBeCloseTo(length({ azimuth: 0, elevation: 0 }, [0.5, 0, 0]));
    expect(length({ azimuth: 0, elevation: 60 }, [0, 0, 0.5])).toBeCloseTo(length({ azimuth: 0, elevation: 0 }, [0, 0, 0.5]) * 0.5);
  });

  it('draws one unit as long on every axis with equal, and without it a box three quarters as tall as wide', () => {
    const edge = (equal: boolean): number => {
      const scene = scene3(model([], { x: [0, 4], y: [0, 2], z: [0, 2], equal }), { azimuth: 0, elevation: 0 }, SIZE, COLOURS);
      const x = scene.axes.find((axis) => axis.axis === 'x')!;
      const z = scene.axes.find((axis) => axis.axis === 'z')!;
      return Math.abs(x.to[0] - x.from[0]) / Math.abs(z.to[1] - z.from[1]);
    };
    expect(edge(true)).toBeCloseTo(2);
    expect(edge(false)).toBeCloseTo(1 / 0.75);
  });
});

describe('paint order', () => {
  const peak = model([graph((x, y) => Math.exp(-8 * (x * x + y * y)))]);

  it.each([[30, 25], [120, 25], [210, 25], [300, 25], [30, -30], [210, -60], [0, 10], [90, 40]])('paints a steep graph so near faces cover far ones at azimuth %i, elevation %i', (azimuth, elevation) => {
    const view = { azimuth, elevation };
    const mesh = meshOf(peak, COLOURS);
    expect(mesh.grid).not.toBeNull();
    expect(depthErrors(mesh.faces, paintOrder(mesh, view), view)).toBe(0);
  });

  it('starts the walk at the far corner of the grid', () => {
    const mesh = meshOf(peak, COLOURS);
    const first = (azimuth: number): number => mesh.faces.indexOf(mesh.faces[paintOrder(mesh, { azimuth, elevation: 25 })[0]]);
    expect([first(30), first(120), first(210), first(300)]).toEqual([48 * 48 - 1, 47, 0, 47 * 48]);
  });

  it('sorts two crossing surfaces by depth across both', () => {
    const crossing = model([graph((x) => (x + 1) / 2), graph((x) => (1 - x) / 2)]);
    const mesh = meshOf(crossing, COLOURS);
    expect(mesh.grid).toBeNull();
    const view = { azimuth: 30, elevation: 25 };
    const order = paintOrder(mesh, view);
    expect(order).toHaveLength(2 * 48 * 48);
    const depth = (i: number): number => mesh.faces[i].centroid[0] * 0.453 + mesh.faces[i].centroid[1] * 0.785 - mesh.faces[i].centroid[2] * 0.423;
    for (let k = 1; k < order.length; k += 1) expect(depth(order[k])).toBeLessThanOrEqual(depth(order[k - 1]) + 1e-3);
    expect(depthErrors(mesh.faces, order, view)).toBeLessThan(0.02);
  });

  it.each([[30, 25], [200, -40], [100, 70]])('sorts a sphere so its front hides its back at azimuth %i, elevation %i', (azimuth, elevation) => {
    const mesh = meshOf(model([sphere], { z: [-1, 1], equal: true }), COLOURS);
    const view = { azimuth, elevation };
    expect(depthErrors(mesh.faces, paintOrder(mesh, view), view)).toBe(0);
  });
});

describe('scene3', () => {
  it('clips a surface at the box', () => {
    const scene = scene3(model([graph((x) => 3 * x)]), { azimuth: 0, elevation: 0 }, SIZE, COLOURS);
    const z = scene.axes.find((axis) => axis.axis === 'z')!;
    const [top, bottom] = [Math.min(z.from[1], z.to[1]), Math.max(z.from[1], z.to[1])];
    const ys = scene.faces.flatMap((face) => face.pts.map((p) => p[1]));
    expect(scene.faces.length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(top - 1e-6);
    expect(Math.max(...ys)).toBeLessThanOrEqual(bottom + 1e-6);
  });

  it('clips faces between huge heights exactly at the box', () => {
    const mesh = meshOf(model([graph((x, y) => (x + y > 0 ? 1.7e308 : -1.7e308) * Math.abs(x * y) + 0.5 * x)], { z: [-2, 2] }), COLOURS);
    const worst = Math.max(...mesh.faces.flatMap((face) => face.v.map((p) => Math.max(...p.map(Math.abs)))));
    expect(mesh.faces.length).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('draws nothing in a hole', () => {
    const holed = scene3(model([graph((x, y) => (x * x + y * y < 0.25 ? null : 0.5))]), { azimuth: 30, elevation: 25 }, SIZE, COLOURS);
    expect(holed.faces.length).toBeLessThan(48 * 48 - 300);
  });

  it('colours the bottom of the box with the first ramp colour and the top with the last, in either theme', () => {
    const light: Colours = { ramp: [[68, 1, 84], [33, 145, 140], [253, 231, 37]] };
    const dark: Colours = { ramp: [[90, 70, 160], [253, 231, 37]] };
    const fills = (z: number, colours: Colours): Set<string> => new Set(scene3(model([graph(() => z)]), { azimuth: 30, elevation: 25 }, SIZE, colours).faces.map((face) => face.fill));
    expect(fills(0, light)).toEqual(new Set(['rgb(68, 1, 84)']));
    expect(fills(1, light)).toEqual(new Set(['rgb(253, 231, 37)']));
    expect(fills(0, dark)).toEqual(new Set(['rgb(90, 70, 160)']));
    expect(fills(1, dark)).toEqual(new Set(['rgb(253, 231, 37)']));
  });

  it('draws the nine edges of the three back faces of the box', () => {
    expect(scene3(model([]), { azimuth: 30, elevation: 25 }, SIZE, COLOURS).box).toHaveLength(9);
  });

  it.each([
    [30, 25, -1, -1],
    [120, 25, 1, -1],
    [210, 25, 1, 1],
    [300, 25, -1, 1],
    [30, -30, 1, 1],
  ])('puts the x and y ticks on the bottom edges lowest on screen at azimuth %i, elevation %i', (azimuth, elevation, ySign, xSign) => {
    const view = { azimuth, elevation };
    const scene = scene3(model([], { xLabel: 'x', yLabel: 'y', zLabel: 'z' }), view, SIZE, COLOURS);
    const p = projection(model([]), view, SIZE);
    const x = scene.axes.find((axis) => axis.axis === 'x')!;
    const y = scene.axes.find((axis) => axis.axis === 'y')!;
    const bottom = -0.75 / 2;
    expect(x.from).toEqual(p([-0.5, ySign / 2, bottom]));
    expect(y.from).toEqual(p([xSign / 2, -0.5, bottom]));
    const z = scene.axes.find((axis) => axis.axis === 'z')!;
    const left = Math.min(...[-0.5, 0.5].flatMap((sx) => [-0.5, 0.5].map((sy) => p([sx, sy, 0])[0])));
    expect(z.from[0]).toBeCloseTo(left);
    expect(scene.titles.map((title) => title.text)).toEqual(['x', 'y', 'z']);
    expect(scene.ticks.length).toBeGreaterThanOrEqual(6);
  });

  it('projects overlays, a Circle in the plane of x and y at its height', () => {
    const scene = scene3(model([{ type: 'Circle', at: [0, 0, 0.5], r: 0.5, tag: 'active' }, { type: 'Points', pts: [[0, 0, 1], [1, 1, 0]], label: 'p' }]), { azimuth: 0, elevation: 0 }, SIZE, COLOURS);
    const [circle, first, second] = scene.overlays;
    expect(circle.kind === 'line' && new Set(circle.points.map((p) => p[1].toFixed(6))).size).toBe(1);
    expect(circle.tag).toBe('active');
    expect([first.kind, first.label, second.label]).toEqual(['dot', 'p', undefined]);
  });

  it('clips overlays at the box: a line splits where it leaves, a point or label outside is dropped, an arrow ending outside loses its head', () => {
    const L: Point3 = [1, 1, 1];
    const runs = clipLine([[0, 0, 0], [0, 0, 2], [0.2, 0, 0], [0.2, 0, -0.2]], L);
    expect(runs.map((run) => run.length)).toEqual([2, 3]);
    expect(runs[0][1]).toEqual([0, 0, 0.5]);
    runs[1][0].forEach((c, k) => expect(c).toBeCloseTo([0.15, 0, 0.5][k]));
    expect(clipLine([[2, 2, 2], [3, 3, 3]], L)).toEqual([]);
    const scene = scene3(model([
      { type: 'Points', pts: [[0, 0, 50], [0, 0, 0.5]], label: 'p' },
      { type: 'Label', at: [5, 5, 5], text: 'away' },
      { type: 'Vector', from: [0, 0, 0.5], to: [3, 3, 3] },
      { type: 'Vector', from: [0, 0, 0.5], to: [0.5, 0.5, 0.5] },
    ]), { azimuth: 30, elevation: 25 }, SIZE, COLOURS);
    expect(scene.overlays.map((overlay) => overlay.kind)).toEqual(['dot', 'line', 'arrow']);
    expect(scene.overlays[0].label).toBe('p');
    for (const overlay of scene.overlays) {
      const points = 'points' in overlay ? overlay.points : overlay.kind === 'dot' ? [overlay.at] : [];
      for (const [x, y] of points) expect(x >= 0 && x <= SIZE.width && y >= 0 && y <= SIZE.height).toBe(true);
    }
  });

  it.each([260, 320, 480])('keeps titles and tick labels inside a %i px frame and clear of each other', (width) => {
    const size = { width, height: width * 0.75 };
    const long = model([], { xLabel: 'weight on the first feature (dimensionless)', yLabel: 'weight on the second feature (dimensionless)', zLabel: 'training loss over the whole data set' });
    for (const azimuth of [0, 30, 120, 210, 300]) {
      const scene = scene3(long, { azimuth, elevation: 25 }, size, COLOURS);
      const boxes: TextBox[] = [...scene.titles.map((title) => title.box), ...scene.ticks.filter((tick) => tick.text).map((tick) => tick.box)];
      for (const [i, a] of boxes.entries()) {
        expect(a.x >= 0 && a.y >= 0 && a.x + Math.min(a.w, width - 4) <= width && a.y + a.h <= size.height).toBe(true);
        for (const b of boxes.slice(i + 1)) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
      expect(scene.ticks.filter((tick) => tick.text).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('sizes text by what it shows, so a title with maths is not sized by its TeX source', () => {
    expect(textWidth('height', 10)).toBeCloseTo(6 * 5.8);
    expect(textWidth(String.raw`$L(\theta) = e^{-\|\theta\|^2}$`, 10)).toBeCloseTo(13 * 5.8);
    expect(textWidth(String.raw`$\displaystyle\int\!\!\int L\,d\theta = \pi$`, 10)).toBeCloseTo(10 * 5.8);
  });
});
