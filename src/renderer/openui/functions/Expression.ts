/**
 * A small arithmetic language for what a model writes inside a string: `a*sin(b*x)`, `normpdf(x, mu, sigma)`.
 * It is parsed here and never handed to `eval`, so the only names it can reach are the ones listed below.
 */
export class ExpressionError extends Error {}

type Scope = Record<string, number>;
type Node = (scope: Scope) => number;

const MAX_TERMS = 10_000;
const FOLD_SHAPE = (name: string) => `${name} takes an index, a start, an end and a body`;

const CONSTANTS = new Map<string, number>([['pi', Math.PI], ['e', Math.E]]);

function erf(x: number): number {
  // Abramowitz and Stegun 7.1.26, within 1.5e-7.
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return Math.sign(x) * (1 - poly * Math.exp(-x * x));
}

function fact(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  let product = 1;
  for (let i = 2; i <= n; i++) product *= i;
  return product;
}

const FUNCTIONS = new Map<string, { arity: number | 'many'; fn: (...args: number[]) => number }>([
  ['sin', { arity: 1, fn: Math.sin }],
  ['cos', { arity: 1, fn: Math.cos }],
  ['tan', { arity: 1, fn: Math.tan }],
  ['asin', { arity: 1, fn: Math.asin }],
  ['acos', { arity: 1, fn: Math.acos }],
  ['atan', { arity: 1, fn: Math.atan }],
  ['atan2', { arity: 2, fn: Math.atan2 }],
  ['sinh', { arity: 1, fn: Math.sinh }],
  ['cosh', { arity: 1, fn: Math.cosh }],
  ['tanh', { arity: 1, fn: Math.tanh }],
  ['exp', { arity: 1, fn: Math.exp }],
  ['ln', { arity: 1, fn: Math.log }],
  ['log10', { arity: 1, fn: Math.log10 }],
  ['log2', { arity: 1, fn: Math.log2 }],
  ['sqrt', { arity: 1, fn: Math.sqrt }],
  ['cbrt', { arity: 1, fn: Math.cbrt }],
  ['abs', { arity: 1, fn: Math.abs }],
  ['floor', { arity: 1, fn: Math.floor }],
  ['ceil', { arity: 1, fn: Math.ceil }],
  ['round', { arity: 1, fn: Math.round }],
  ['sign', { arity: 1, fn: Math.sign }],
  ['pow', { arity: 2, fn: Math.pow }],
  ['hypot', { arity: 2, fn: Math.hypot }],
  ['min', { arity: 'many', fn: Math.min }],
  ['max', { arity: 'many', fn: Math.max }],
  ['fact', { arity: 1, fn: fact }],
  ['normpdf', { arity: 3, fn: (x, mu, sigma) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI)) }],
  ['normcdf', { arity: 3, fn: (x, mu, sigma) => 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2))) }],
]);

type Token = { kind: 'num'; value: number } | { kind: 'name'; value: string } | { kind: 'op'; value: string } | { kind: 'end' };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/%^(),]))/y;
  let at = 0;
  while (at < source.length) {
    pattern.lastIndex = at;
    const match = pattern.exec(source);
    if (!match) {
      const rest = source.slice(at).trimStart();
      if (!rest) break;
      throw new ExpressionError(`Unexpected character ${rest[0]}`);
    }
    at = pattern.lastIndex;
    if (match[1] !== undefined) tokens.push({ kind: 'num', value: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ kind: 'name', value: match[2] });
    else tokens.push({ kind: 'op', value: match[3]! });
  }
  tokens.push({ kind: 'end' });
  return tokens;
}

class Parser {
  private at = 0;

  constructor(
    private readonly tokens: Token[],
    private variables: ReadonlySet<string>,
  ) {}

  parse(): Node {
    const node = this.additive();
    const token = this.peek();
    if (token.kind !== 'end') throw new ExpressionError(`Unexpected ${describe(token)}`);
    return node;
  }

  private peek(): Token {
    return this.tokens[this.at]!;
  }

  private take(): Token {
    return this.tokens[this.at++]!;
  }

  private isOp(value: string): boolean {
    const token = this.peek();
    return token.kind === 'op' && token.value === value;
  }

  private additive(): Node {
    let left = this.multiplicative();
    while (this.isOp('+') || this.isOp('-')) {
      const plus = (this.take() as { value: string }).value === '+';
      const a = left;
      const b = this.multiplicative();
      left = plus ? (s) => a(s) + b(s) : (s) => a(s) - b(s);
    }
    return left;
  }

  private multiplicative(): Node {
    let left = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = (this.take() as { value: string }).value;
      const a = left;
      const b = this.unary();
      left = op === '*' ? (s) => a(s) * b(s) : op === '/' ? (s) => a(s) / b(s) : (s) => a(s) % b(s);
    }
    return left;
  }

  private unary(): Node {
    if (this.isOp('-')) {
      this.take();
      const inner = this.unary();
      return (s) => -inner(s);
    }
    if (this.isOp('+')) {
      this.take();
      return this.unary();
    }
    return this.power();
  }

  /** Right-associative, and binds tighter than a minus in front: -2^2 is -4. */
  private power(): Node {
    const base = this.atom();
    if (!this.isOp('^')) return base;
    this.take();
    const exponent = this.unary();
    return (s) => Math.pow(base(s), exponent(s));
  }

  private atom(): Node {
    const token = this.take();
    if (token.kind === 'num') {
      const value = token.value;
      return () => value;
    }
    if (token.kind === 'op' && token.value === '(') {
      const inner = this.additive();
      this.expect(')');
      return inner;
    }
    if (token.kind === 'name') return this.isOp('(') ? this.call(token.value) : this.name(token.value);
    throw new ExpressionError(`Unexpected ${describe(token)}`);
  }

  private name(name: string): Node {
    const constant = CONSTANTS.get(name);
    if (constant !== undefined) return () => constant;
    if (this.variables.has(name)) return (s) => s[name]!;
    throw new ExpressionError(`Unknown name ${name}`);
  }

  private call(name: string): Node {
    if (name === 'sum' || name === 'prod') return this.fold(name);
    const spec = FUNCTIONS.get(name);
    if (!spec) throw new ExpressionError(`Unknown function ${name}`);
    this.take();
    const args: Node[] = [];
    if (!this.isOp(')')) {
      do args.push(this.additive());
      while (this.isOp(',') && this.take());
    }
    this.expect(')');
    if (spec.arity === 'many' ? args.length === 0 : args.length !== spec.arity) {
      throw new ExpressionError(`${name} takes ${spec.arity === 'many' ? 'at least 1 argument' : `${spec.arity} argument${spec.arity === 1 ? '' : 's'}`}`);
    }
    const { fn } = spec;
    return (s) => fn(...args.map((arg) => arg(s)));
  }

  /** sum(k, from, to, body) and prod(...): the body runs for each whole k from `from` to `to`. */
  private fold(name: 'sum' | 'prod'): Node {
    this.take();
    const index = this.take();
    if (index.kind !== 'name') throw new ExpressionError(`${name} needs a name for its index first`);
    if (CONSTANTS.has(index.value)) throw new ExpressionError(`Cannot use ${index.value} as an index`);
    if (this.variables.has(index.value)) throw new ExpressionError(`${index.value} is already a name`);
    this.comma(name);
    const from = this.additive();
    this.comma(name);
    const to = this.additive();
    this.comma(name);
    const outer = this.variables;
    this.variables = new Set([...outer, index.value]);
    const body = this.additive();
    this.variables = outer;
    if (!this.isOp(')')) throw new ExpressionError(FOLD_SHAPE(name));
    this.expect(')');
    const key = index.value;
    const start = name === 'sum' ? 0 : 1;
    return (scope) => {
      const first = Math.ceil(from(scope));
      const last = Math.floor(to(scope));
      if (!(last - first < MAX_TERMS)) return NaN;
      let total = start;
      // The index shadows a variable of the same name only while the loop runs, so no scope is copied per term.
      const outer = scope[key];
      for (let k = first; k <= last; k++) {
        scope[key] = k;
        const value = body(scope);
        total = name === 'sum' ? total + value : total * value;
      }
      if (outer === undefined) delete scope[key];
      else scope[key] = outer;
      return total;
    };
  }

  private comma(name: string): void {
    if (!this.isOp(',')) throw new ExpressionError(FOLD_SHAPE(name));
    this.take();
  }

  private expect(op: string): void {
    const token = this.take();
    if (token.kind !== 'op' || token.value !== op) throw new ExpressionError(`Expected ${op}, found ${describe(token)}`);
  }
}

function describe(token: Token): string {
  return token.kind === 'end' ? 'end of expression' : String(token.value);
}

/** Checks `source` once and returns a function that evaluates it for a scope of values. Throws `ExpressionError`. */
export function compileExpression(source: string, variables: readonly string[]): (scope: Scope) => number {
  if (!source.trim()) throw new ExpressionError('Empty expression');
  return new Parser(tokenize(source), new Set(variables)).parse();
}
