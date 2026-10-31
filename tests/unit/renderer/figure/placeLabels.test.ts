import { placeLabels } from '@/renderer/figure/placeLabels';

const box = { x0: 0, y0: 0, x1: 400, y1: 300 };
const overlap = (a: { x: number; y: number }, b: { x: number; y: number }, w: number, h: number): boolean => Math.abs(a.x - b.x) < w && Math.abs(a.y - b.y) < h;

describe('placeLabels', () => {
  it('pushes two labels at the same point apart', () => {
    const [a, b] = placeLabels([{ x: 100, y: 100, width: 60, height: 14 }, { x: 100, y: 100, width: 60, height: 14 }], box, []);
    expect(overlap(a, b, 60, 14)).toBe(false);
  });

  it('keeps a label at the right edge inside the box', () => {
    const [at] = placeLabels([{ x: 398, y: 150, width: 80, height: 14 }], box, []);
    expect(at.x + 80).toBeLessThanOrEqual(400);
    expect(at.x).toBeGreaterThanOrEqual(0);
  });

  it('picks the corner no line crosses', () => {
    // A line rising through the upper-right corner of the point at (100, 100).
    const line: [number, number][] = [[100, 100], [200, 0]];
    const [at] = placeLabels([{ x: 100, y: 100, width: 40, height: 14 }], box, [line]);
    expect(at.x < 100 || at.y > 100).toBe(true);
  });

  it('keeps clear of fixed boxes, choosing another corner or moving off them', () => {
    const tick = { x0: 100, y0: 70, x1: 160, y1: 100 };
    const [beside] = placeLabels([{ x: 100, y: 100, width: 40, height: 14 }], box, [], [tick]);
    expect(beside.x + 40 <= tick.x0 || beside.x >= tick.x1 || beside.y + 14 <= tick.y0 || beside.y >= tick.y1).toBe(true);
    const wall = [{ x0: 0, y0: 80, x1: 400, y1: 99 }, { x0: 0, y0: 101, x1: 400, y1: 125 }];
    const [pushed] = placeLabels([{ x: 200, y: 100, width: 40, height: 14 }], box, [], wall);
    expect(wall.some((f) => pushed.x < f.x1 && f.x0 < pushed.x + 40 && pushed.y < f.y1 && f.y0 < pushed.y + 14)).toBe(false);
  });
});
