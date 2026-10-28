import { Curve, Eval } from '@/renderer/openui/functions/functions';

describe('Curve', () => {
  it('samples y = f(x) from one end to the other with the named numbers', () => {
    const points = Curve.fn({ expr: 'a * x + b', x0: 0, x1: 2, vars: { a: 3, b: 1 } }) as number[][];

    expect(points[0]).toEqual([0, 1]);
    expect(points.at(-1)).toEqual([2, 7]);
    expect(points.length).toBeGreaterThan(100);
  });

  it('puts null where the function is undefined', () => {
    const points = Curve.fn({ expr: '1 / x', x0: -1, x1: 1 }) as (number | null)[][];

    expect(points.some((p) => p[1] === null)).toBe(true);
    expect(points[0]![1]).toBe(-1);
  });

  it('refuses a bad expression or a name it cannot take', () => {
    expect(() => Curve.fn({ expr: 'foo(x)', x0: 0, x1: 1 })).toThrow(/unknown function/i);
    expect(() => Curve.fn({ expr: 'x', x0: 0, x1: 1, vars: { x: 1 } })).toThrow(/variable name/i);
    expect(() => Curve.fn({ expr: 'x', x0: 0, x1: 1, vars: { 'a b': 1 } })).toThrow(/variable name/i);
  });
});

describe('Eval', () => {
  it('gives one number from an expression', () => {
    expect(Eval.fn({ expr: '-1000 + 300 / (1 + r) + 700 / (1 + r) ^ 2', vars: { r: 0.1 } })).toBeCloseTo(-1000 + 300 / 1.1 + 700 / 1.21, 10);
  });

  it('gives null for a value that is not a number', () => {
    expect(Eval.fn({ expr: '1 / 0' })).toBeNull();
    expect(Eval.fn({ expr: 'sqrt(-4)' })).toBeNull();
  });
});
