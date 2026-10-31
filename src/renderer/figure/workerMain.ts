// Runs only inside a blob Worker started by the sandbox iframe: compiles a figure program, runs it and posts a plain tree.
// Nothing here is trusted by the host, which validates what this posts; this only samples functions and makes the tree plain.
import { transform } from 'sucrase';

import { along, circleThrough, dist, foot, intersect, rotate } from '@/renderer/figure/diagram/construct';
import { ELEMENT_PROPS, LIMITS } from '@/renderer/figure/FigureData';

declare const self: { onmessage: ((event: { data: unknown }) => void) | null; postMessage(message: unknown): void; __run?: (module: unknown, exports: unknown) => void; __probe?: number };
declare function importScripts(...urls: string[]): void;

type Wire = { type: string; props: Record<string, unknown>; children: unknown[] };
type Request = { kind: 'run'; source: string; params?: Record<string, unknown> } | { kind: 'probe' };

const ELEMENT = Symbol('element');
const NAMES = ['Figure', ...Object.keys(ELEMENT_PROPS)];

class FigureError extends Error {
  constructor(message: string, readonly line?: number) {
    super(message);
  }
}

self.onmessage = (event) => {
  const request = event.data as Request;
  if (request.kind === 'probe') {
    void probe().then((result) => self.postMessage(result));
    return;
  }
  let reply: unknown;
  try {
    reply = run(request.source, request.params ?? {});
  } catch (error) {
    reply = { error: error instanceof FigureError ? { message: error.message, line: error.line } : { message: messageOf(error) } };
  }
  try {
    self.postMessage(reply);
  } catch (error) {
    self.postMessage({ error: { message: `The figure returned a value that cannot be sent: ${messageOf(error)}` } });
  }
};

async function probe(): Promise<unknown> {
  const url = URL.createObjectURL(new Blob(['self.__probe = 1;'], { type: 'text/javascript' }));
  try {
    importScripts(url);
  } catch {
    // Blocked: importWorks stays false.
  }
  URL.revokeObjectURL(url);
  // Read off the global: esbuild rewrites a bare `require` to its own shim.
  const scope = self as unknown as Record<string, unknown>;
  // The probe's fetch must fail: the sandbox's policy blocks every request, even a data: URL.
  const request = scope.fetch as ((url: string) => Promise<unknown>) | undefined;
  const fetchBlocked = typeof request !== 'function' || (await request.call(self, 'data:text/plain,x').then(() => false, () => true));
  return { require: typeof scope.require, process: typeof scope.process, importWorks: self.__probe === 1, fetchBlocked };
}

function run(source: string, sent: Record<string, unknown>): unknown {
  let code: string;
  try {
    // production: true, or sucrase adds __self and __source to every element's props.
    code = transform(source, { transforms: ['jsx', 'imports'], jsxPragma: '__h', jsxFragmentPragma: '__F', production: true }).code;
  } catch (error) {
    const line = (error as { loc?: { line?: number } }).loc?.line;
    throw new FigureError(`Syntax error: ${messageOf(error)}`, line);
  }
  for (const name of NAMES) {
    const shadow = new RegExp(`\\b(?:const|let|var|function|class)\\s+(${name})\\b`).exec(source);
    if (shadow) throw new FigureError(`\`${name}\` is not an element here: your variable named ${name} shadows it`, source.slice(0, shadow.index).split('\n').length);
  }
  defineGlobals();

  const url = URL.createObjectURL(new Blob([`self.__run = function (module, exports) {${code}\n};`], { type: 'text/javascript' }));
  const module: { exports: Record<string, unknown> } = { exports: {} };
  try {
    importScripts(url);
    URL.revokeObjectURL(url);
    self.__run!(module, module.exports);
  } catch (error) {
    throw located(error, url, '');
  }
  const main = module.exports.default;
  if (typeof main !== 'function') throw new FigureError('The figure must export a default function');
  const declared = module.exports.params;
  const args: Record<string, unknown> = {};
  if (declared && typeof declared === 'object') {
    for (const key of Object.keys(declared)) {
      const spec = (declared as Record<string, Record<string, unknown> | undefined>)[key];
      args[key] = Object.hasOwn(sent, key) ? sent[key] : spec?.value ?? (spec?.text ? '' : Array.isArray(spec?.options) ? spec.options[0] : spec?.min);
    }
  }

  let result: unknown;
  try {
    result = (main as (params: unknown) => unknown)(args);
  } catch (error) {
    throw located(error, url, '');
  }
  const frames: { caption: unknown; heading?: unknown; root: unknown }[] = [];
  let title: unknown;
  if (isWire(result) && result.type === 'Figure') {
    const { steps, caption, heading, render } = result.props;
    title = result.props.title;
    if (!Array.isArray(steps)) throw new FigureError('Figure steps must be an array, one value per step');
    if (steps.length > LIMITS.steps) throw new FigureError(`Figure: ${steps.length} steps; the limit is ${LIMITS.steps}`);
    if (typeof render !== 'function') throw new FigureError('Figure render must be a function of the step');
    steps.forEach((step, i) => {
      const call = (fn: unknown): unknown => (fn as (s: unknown, i: number) => unknown)(step, i);
      try {
        frames.push({
          caption: typeof caption === 'function' ? call(caption) : '',
          ...(typeof heading === 'function' ? { heading: call(heading) } : {}),
          root: plain(call(render), undefined),
        });
      } catch (error) {
        throw located(error, url, `Step ${i + 1}: `);
      }
    });
  } else {
    try {
      frames.push({ caption: '', root: plain(result, undefined) });
    } catch (error) {
      throw located(error, url, '');
    }
  }
  return { params: declared, ...(title === undefined ? {} : { title }), frames };
}

function defineGlobals(): void {
  const scope = self as unknown as Record<string, unknown>;
  for (const name of [...NAMES, 'Fragment']) scope[name === 'Fragment' ? '__F' : name] = Object.freeze({ [ELEMENT]: name });
  scope.__h = h;
  Object.assign(scope, { intersect, foot, rotate, along, circleThrough, dist });
  // Seeded and fixed, so a saved figure draws the same on every open.
  let seed = 0x9e3779b9;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Date.now = () => 0;
}

function h(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown {
  const kept = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== true && child !== false);
  if (typeof type === 'object' && type !== null && Object.hasOwn(type, ELEMENT)) {
    const rest = { ...props };
    // `key` is a React habit with no meaning here.
    delete rest.key;
    return { type: (type as Record<symbol, string>)[ELEMENT], props: rest, children: kept };
  }
  if (typeof type === 'function') return (type as (props: unknown) => unknown)({ ...props, children: kept });
  throw new FigureError('An element was replaced by a value: do not name a variable after an element');
}

function isWire(value: unknown): value is Wire {
  return typeof value === 'object' && value !== null && typeof (value as Wire).type === 'string' && typeof (value as Wire).props === 'object' && Array.isArray((value as Wire).children);
}

/** The tree with Fragments spliced, each Fn sampled, and no function left. */
function plain(value: unknown, plot: Wire | undefined, prop = ''): unknown {
  if (typeof value === 'function') throw new FigureError(`${prop || 'A value'} is a function; only Fn's f may be one`);
  if (Array.isArray(value)) return value.map((item) => plain(item, plot, prop));
  if (typeof value !== 'object' || value === null) return value;
  if (!isWire(value)) return Object.fromEntries(Object.keys(value).map((key) => [key, plain((value as Record<string, unknown>)[key], plot, key)]));
  const children = value.children.flatMap((child) => (isWire(child) && child.type === 'Fragment' ? child.children : [child]));
  const here = value.type === 'Plot' ? value : plot;
  const props: Record<string, unknown> = {};
  for (const key of Object.keys(value.props)) {
    // pts and zs are what the worker samples, never what the program wrote.
    if (value.type === 'Fn' && (key === 'f' || key === 'pts' || key === 'zs')) continue;
    props[key] = plain(value.props[key], here, key);
  }
  if (value.type === 'Fn') Object.assign(props, sample(value.props, here));
  return { type: value.type, props, children: children.map((child) => plain(child, here, prop)) };
}

function sample(props: Record<string, unknown>, plot: Wire | undefined): { pts: unknown[] } | { zs: unknown[] } {
  const f = props.f;
  if (typeof f !== 'function') throw new FigureError('Fn needs f, a function of x');
  const x = plot?.props.x;
  const from = Number(props.from ?? (Array.isArray(x) ? x[0] : 0));
  const to = Number(props.to ?? (Array.isArray(x) ? x[1] : 1));
  if (f.length >= 2) return sampleSurface(f as (a: number, b: number) => unknown, props, Array.isArray(props.u) ? props.u : [from, to], Array.isArray(props.v) ? props.v : plot?.props.y);
  return {
    pts: Array.from({ length: LIMITS.fnSamples }, (_, i) => {
      const at = from + ((to - from) * i) / (LIMITS.fnSamples - 1);
      const y = Number((f as (x: number) => unknown)(at));
      return [at, Number.isFinite(y) ? y : null];
    }),
  };
}

/**
 * Samples a function of two variables on the surface grid. The first finite sample decides what it is: a number makes a
 * graph z = f(x, y), sent as `zs`; a point makes a parametric surface, sent as `pts`. A non-finite value is a hole in either.
 */
function sampleSurface(f: (a: number, b: number) => unknown, props: Record<string, unknown>, u: unknown[], v: unknown): { pts: unknown[] } | { zs: unknown[] } {
  const name = typeof props.id === 'string' ? `Fn \`${props.id}\`` : 'Fn';
  const [u0, u1] = [Number(u[0]), Number(u[1])];
  const [v0, v1] = Array.isArray(v) ? [Number(v[0]), Number(v[1])] : [0, 1];
  const n = LIMITS.surfaceCells;
  let kind: 'graph' | 'parametric' | undefined;
  const out: unknown[] = [];
  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      const a = u0 + ((u1 - u0) * i) / n;
      const b = v0 + ((v1 - v0) * j) / n;
      const value = f(a, b);
      if (Array.isArray(value)) {
        if (value.length !== 3) throw new FigureError(`${name} returned a point with ${value.length} coordinates at (${a}, ${b}); a parametric surface returns [x, y, z]`);
        if (kind === 'graph') throw new FigureError(`${name} returned a point at (${a}, ${b}) after returning numbers; f returns numbers everywhere for a graph z = f(x, y), or [x, y, z] everywhere for a parametric surface`);
        const point = value.map(Number);
        const finite = point.every(Number.isFinite);
        if (finite) kind = 'parametric';
        out.push(finite ? point : null);
      } else {
        const z = Number(value);
        const finite = Number.isFinite(z);
        if (finite && kind === 'parametric') throw new FigureError(`${name} returned a number at (${a}, ${b}) after returning points; f returns [x, y, z] everywhere for a parametric surface, or numbers everywhere for a graph z = f(x, y)`);
        if (finite) kind = 'graph';
        out.push(finite ? z : null);
      }
    }
  }
  return kind === 'parametric' ? { pts: out } : { zs: out };
}

/** The error as the host shows it, with the program line its stack names. */
function located(error: unknown, url: string, prefix: string): FigureError {
  if (error instanceof FigureError) return new FigureError(prefix + error.message, error.line);
  const name = error instanceof Error ? error.name : 'Error';
  const frame = (error instanceof Error ? error.stack ?? '' : '').split('\n').find((line) => line.includes(url));
  const line = frame ? Number(/:(\d+):\d+\)?\s*$/.exec(frame)?.[1]) || undefined : undefined;
  return new FigureError(`${prefix}${name === 'SyntaxError' ? 'Syntax error' : name}: ${messageOf(error)}`, line);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
