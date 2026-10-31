import { angleMark, dimensionMark, rightAngleMark, tickMarks } from '@/renderer/figure/diagram/marks';

describe('geometry marks', () => {
  it('spans an angle counter-clockwise with its label on the bisector, outside the arc', () => {
    const mark = angleMark([0, 0], [10, 0], [0, 10], 1, [0.3, 0.2], 0.1);
    expect([mark.start, mark.end, mark.radius]).toEqual([0, 90, 1]);
    expect(mark.label[0]).toBeCloseTo(mark.label[1], 12);
    // The box's nearest corner is the gap outside the arc.
    expect(mark.label[0] - 0.3 + (mark.label[1] - 0.2)).toBeCloseTo((1 + 0.1) * Math.SQRT2, 12);
  });

  it("takes a narrow angle's arc out until its label clears both rays, within the shorter ray", () => {
    const t = (10 * Math.PI) / 180;
    const mark = angleMark([0, 0], [10, 0], [10 * Math.cos(t), 10 * Math.sin(t)], 1, [0.5, 0.3], 0.1);
    expect(mark.radius).toBeGreaterThan(1);
    expect(mark.radius).toBeLessThanOrEqual(6);
    const [x, y] = mark.label;
    // Below the box is the lower ray (y = 0); its top-left corner is beside the upper one.
    expect(y - 0.3).toBeGreaterThanOrEqual(0.1 - 1e-9);
    expect(Math.sin(t) * (x - 0.5) - Math.cos(t) * (y + 0.3)).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  it('keeps the arc within 0.6 of the shorter ray when the label cannot fit', () => {
    const t = (2 * Math.PI) / 180;
    expect(angleMark([0, 0], [1, 0], [Math.cos(t), Math.sin(t)], 0.1, [0.5, 0.3], 0.1).radius).toBeCloseTo(0.6, 12);
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
    expect(dim.label).toEqual([2, 1.9]);
  });
});
