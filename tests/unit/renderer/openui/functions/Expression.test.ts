import { compileExpression, ExpressionError } from '@/renderer/openui/functions/Expression';

const run = (source: string, scope: Record<string, number> = {}) => compileExpression(source, Object.keys(scope))(scope);

describe('compileExpression', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 - 4 - 3', 3],
    ['2 ^ 3 ^ 2', 512],
    ['-2 ^ 2', -4],
    ['2 ^ -1', 0.5],
    ['7 % 4', 3],
    ['- -3', 3],
    ['1.5e2', 150],
    ['.5 + .25', 0.75],
  ])('evaluates %s to %p', (source, want) => {
    expect(run(source)).toBe(want);
  });

  it('reads variables and the constants pi and e', () => {
    expect(run('a * x + 1', { a: 3, x: 2 })).toBe(7);
    expect(run('pi')).toBeCloseTo(Math.PI);
    expect(run('ln(e)')).toBeCloseTo(1);
  });

  it('calls the math functions', () => {
    expect(run('sin(0) + cos(0)')).toBe(1);
    expect(run('sqrt(16) + abs(-2) + max(1, 5, 3) + min(4, 2)')).toBe(13);
    expect(run('log10(1000) + log2(8)')).toBeCloseTo(6);
    expect(run('fact(5)')).toBe(120);
    expect(run('atan2(1, 1)')).toBeCloseTo(Math.PI / 4);
  });

  it('knows the normal density and distribution', () => {
    expect(run('normpdf(0, 0, 1)')).toBeCloseTo(0.3989423, 6);
    expect(run('normcdf(0, 0, 1)')).toBeCloseTo(0.5, 6);
    expect(run('normcdf(1.6449, 0, 1)')).toBeCloseTo(0.95, 3);
  });

  it('gives a non-finite number for a division by zero and a root of a negative', () => {
    expect(run('1 / 0')).toBe(Infinity);
    expect(run('sqrt(-1)')).toBeNaN();
  });

  it.each([
    ['1 +', /unexpected end/i],
    ['2 x', /unexpected/i],
    ['foo(1)', /unknown function foo/i],
    ['y + 1', /unknown name y/i],
    ['sin(1, 2)', /sin takes 1/i],
    ['(1 + 2', /expected \)/i],
    ['1 $ 2', /unexpected character/i],
    ['', /empty/i],
  ])('rejects %p', (source, message) => {
    expect(() => compileExpression(source, [])).toThrow(ExpressionError);
    expect(() => compileExpression(source, [])).toThrow(message);
  });

  it('cannot reach anything outside its own names', () => {
    expect(() => compileExpression('constructor', [])).toThrow(/unknown name/i);
    expect(() => compileExpression('process.exit(1)', [])).toThrow(ExpressionError);
    expect(() => compileExpression('toString()', [])).toThrow(/unknown function/i);
    expect(() => compileExpression('__proto__', [])).toThrow(/unknown name/i);
  });
});

describe('sum and prod', () => {
  it('add up and multiply a body over whole numbers, ends included', () => {
    expect(run('sum(k, 1, 4, k)')).toBe(10);
    expect(run('sum(k, 0, 3, 2 ^ k)')).toBe(15);
    expect(run('prod(k, 1, 5, k)')).toBe(120);
  });

  it('read the names around them, including a count taken from a variable', () => {
    const taylor = 'sum(j, 0, n - 1, (-1) ^ j * x ^ (2 * j + 1) / fact(2 * j + 1))';
    expect(run(taylor, { x: 1, n: 8 })).toBeCloseTo(Math.sin(1), 10);
    expect(run(taylor, { x: 1, n: 1 })).toBe(1);
    expect(run('sum(t, 1, 3, 100 / (1 + r) ^ t)', { r: 0 })).toBe(300);
  });

  it('give 0 and 1 for an empty range', () => {
    expect(run('sum(k, 5, 1, k)')).toBe(0);
    expect(run('prod(k, 5, 1, k)')).toBe(1);
  });

  it('nest, and keep the index to themselves', () => {
    expect(run('sum(i, 1, 3, sum(j, 1, i, j))')).toBe(10);
    expect(() => compileExpression('sum(k, 1, 3, k) + k', [])).toThrow(/unknown name k/i);
  });

  it('refuse a runaway count', () => {
    expect(run('sum(k, 1, 1e9, 1)')).toBeNaN();
  });

  it.each([
    ['sum(e, 1, 3, 1)', /cannot use e/i],
    ['sum(x, 1, 3, 1)', /already/i],
    ['sum(1, 1, 3, 1)', /name/i],
    ['sum(k, 1, 3)', /sum takes/i],
  ])('rejects %p', (source, message) => {
    expect(() => compileExpression(source, ['x'])).toThrow(message);
  });
});
