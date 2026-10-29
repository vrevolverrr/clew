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
});
