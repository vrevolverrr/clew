import { circleThrough, foot, intersect, rotate } from '@/renderer/figure/diagram/construct';

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
});
