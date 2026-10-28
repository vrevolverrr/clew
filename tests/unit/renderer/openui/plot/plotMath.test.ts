import { barSteps, niceDomain, niceTicks, wrapLabel } from '@/renderer/openui/plot/plotMath';

describe('niceTicks', () => {
  it('steps by round numbers that stay inside the range', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-7, 7, 7)).toEqual([-6, -4, -2, 0, 2, 4, 6]);
    expect(niceTicks(0, 0.35, 5)).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it('has no float noise in its values', () => {
    for (const tick of niceTicks(0, 1, 10)) expect(String(tick).length).toBeLessThan(5);
  });
});

describe('niceDomain', () => {
  it('widens a range to round ends that hold it', () => {
    expect(niceDomain(0.3, 8.7)).toEqual([0, 10]);
    expect(niceDomain(-3.2, 1)).toEqual([-4, 1]);
  });

  it('gives a flat range some height', () => {
    const [lo, hi] = niceDomain(5, 5);
    expect(hi).toBeGreaterThan(lo);
    expect(lo).toBeLessThanOrEqual(5);
    expect(hi).toBeGreaterThanOrEqual(5);
  });
});

describe('wrapLabel', () => {
  it('keeps a short name on one line', () => {
    expect(wrapLabel('Revenue', 10)).toEqual({ lines: ['Revenue'], fits: true });
  });

  it('breaks at spaces so each line fits', () => {
    expect(wrapLabel('Operating expenses', 10)).toEqual({ lines: ['Operating', 'expenses'], fits: true });
    expect(wrapLabel('Cost of goods sold', 10)).toEqual({ lines: ['Cost of', 'goods sold'], fits: true });
  });

  it('says it does not fit when one word is wider than a line', () => {
    expect(wrapLabel('Operating income', 7).fits).toBe(false);
  });

  it('says it does not fit when it needs more than three lines', () => {
    expect(wrapLabel('one two three four five six', 7).fits).toBe(false);
  });
});

describe('barSteps', () => {
  it('stands plain bars on the baseline', () => {
    expect(barSteps([3, -2, null], 'bars')).toEqual([
      { from: 0, to: 3, kind: 'bar', value: 3 },
      { from: 0, to: -2, kind: 'bar', value: -2 },
      { from: 0, to: 0, kind: 'bar', value: 0 },
    ]);
  });

  it('steps a waterfall from the running total and stands the subtotals on the baseline', () => {
    const steps = barSteps([1200, -660, null, -300, null, -60, -45, null], 'waterfall');

    expect(steps.map((s) => [s.from, s.to, s.kind])).toEqual([
      [0, 1200, 'total'],
      [1200, 540, 'down'],
      [0, 540, 'total'],
      [540, 240, 'down'],
      [0, 240, 'total'],
      [240, 180, 'down'],
      [180, 135, 'down'],
      [0, 135, 'total'],
    ]);
    expect(steps[2]!.value).toBe(540);
    expect(steps[1]!.value).toBe(-660);
  });

  it('marks a rise and carries on from it', () => {
    const steps = barSteps([100, 40, -10, null], 'waterfall');

    expect(steps.map((s) => s.kind)).toEqual(['total', 'up', 'down', 'total']);
    expect(steps[3]!.to).toBe(130);
  });
});
