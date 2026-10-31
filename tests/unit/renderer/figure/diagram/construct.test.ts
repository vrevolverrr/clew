import { circleThrough, foot, intersect, project, rotate, surface } from '@/renderer/figure/diagram/construct';

describe('construction functions', () => {
  it('intersects lines, and gives null for parallel ones', () => {
    expect(intersect([[0, 1], [2, 1]], [[1, 0], [1, 3]])).toEqual([1, 1]);
    expect(intersect([[0, 0], [1, 1]], [[0, 1], [1, 2]])).toBeNull();
  });

  it('drops a perpendicular', () => {
    expect(foot([0, 1], [[-1, 0], [1, 0]])).toEqual([0, 0]);
  });

  it('rotates counter-clockwise', () => {
    const [x, y] = rotate([1, 0], [0, 0], 90);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(1, 12);
  });

  it('finds the circumcircle, and null for collinear points', () => {
    const circle = circleThrough([0, 0], [2, 0], [0, 2]);
    expect(circle?.at[0]).toBeCloseTo(1, 12);
    expect(circle?.at[1]).toBeCloseTo(1, 12);
    expect(circle?.r).toBeCloseTo(Math.SQRT2, 12);
    expect(circleThrough([0, 0], [1, 1], [2, 2])).toBeNull();
  });

  it('projects with z up: a side view keeps z, a top view keeps the plan', () => {
    expect(project([2, 5, 3], { azimuth: 0, elevation: 0 })).toEqual([2, 3]);
    expect(project([2, 5, 3], { azimuth: 0, elevation: 0, zScale: 0.5 })).toEqual([2, 1.5]);
    const [x, y] = project([2, 5, 3], { azimuth: 0, elevation: 90 });
    expect(x).toBeCloseTo(2, 12);
    expect(y).toBeCloseTo(5, 12);
  });

  it('draws a surface as n + 1 lines each way, within the Shape point limit', () => {
    const lines = surface((x, y) => x + y, [0, 1], [0, 1], { n: 100, azimuth: 0, elevation: 0 });
    expect(lines).toHaveLength(202);
    expect(() => surface((x, y) => x + y, [0, 1], [0, 1], { n: 0 })).toThrow('n must be a whole number from 1 to 127');
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(256);
    expect(lines[0][0]).toEqual([0, 0]);
    expect(lines[0].at(-1)).toEqual([0, 1]);
  });

  it('breaks a line where the surface is not defined, leaving only finite points', () => {
    const lines = surface((x, y) => Math.sqrt(1 - x * x - y * y), [-1, 1], [-1, 1], { n: 4 });
    expect(lines).toHaveLength(6);
    expect(lines.flat(2).every(Number.isFinite)).toBe(true);
  });
});
