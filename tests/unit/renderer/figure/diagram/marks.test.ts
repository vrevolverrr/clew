import { angleMark, dimensionMark, rightAngleMark, tickMarks } from '@/renderer/figure/diagram/marks';

describe('geometry marks', () => {
  it('spans an angle counter-clockwise with its label on the bisector, outside the arc', () => {
    const mark = angleMark([0, 0], [1, 0], [0, 1], 1);
    expect([mark.start, mark.end]).toEqual([0, 90]);
    expect(mark.label[0]).toBeCloseTo(mark.label[1], 12);
    expect(Math.hypot(...mark.label)).toBeGreaterThan(1);
  });

  it('marks the smaller angle whichever ray comes first', () => {
    expect(angleMark([0, 0], [0, 1], [1, 0], 1)).toMatchObject({ start: 0, end: 90 });
  });

  it('draws evenly spaced ticks across the middle, perpendicular to the segment', () => {
    const ticks = tickMarks([0, 0], [4, 0], 3, 0.2, 0.1);
    [1.9, 2, 2.1].forEach((x, i) => expect(ticks[i][0][0]).toBeCloseTo(x, 12));
    for (const [a, b] of ticks) {
      expect(a[0]).toBeCloseTo(b[0], 12);
      expect(Math.abs(b[1] - a[1])).toBeCloseTo(0.2, 12);
    }
  });

  it('places the right-angle square and the dimension line', () => {
    expect(rightAngleMark([0, 0], [2, 0], [0, 3], 0.5)).toEqual([[0.5, 0], [0.5, 0.5], [0, 0.5]]);
    const dim = dimensionMark([0, 0], [4, 0], 1);
    expect(dim.line).toEqual([[0, 1], [4, 1]]);
    expect(dim.label[1]).toBeGreaterThan(1);
  });
});
