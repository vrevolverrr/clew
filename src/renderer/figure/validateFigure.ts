import {
  ELEMENT_PROPS, ID, LIMITS, TAGS,
  type DiagramLayer, type FigureData, type FigureNode, type GraphEdge, type GraphNode, type Param, type PlotLayer, type Point, type Step, type Tag, type Tags, type Text,
} from '@/renderer/figure/FigureData';
import { texAnchors, texIn, texProblems } from '@/renderer/figure/figureTex';
import { formatFigure } from '@/renderer/figure/formatFigure';

class Invalid extends Error {}

function fail(path: string, message: string): never {
  throw new Invalid(`${path}: ${message}`);
}

const n = (count: number): string => count.toLocaleString('en');
const over = (count: number, what: string, limit: number): string => `${n(count)} ${what}; the limit is ${n(limit)}`;

/**
 * Reads what a figure program returned. The data is a structured clone from a realm the model controls, so it is checked
 * value by value: only plain data passes, props are read with `Object.hasOwn`, and nothing received is spread or assigned.
 */
export function validateFigure(raw: unknown): { ok: true; figure: FigureData } | { ok: false; error: string } {
  try {
    checkPlain(raw);
    return { ok: true, figure: readFigure(raw) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}

/** Accepts only null, undefined (read as absent), booleans, finite numbers, strings, dense arrays and plain objects, acyclic and within the limits. */
function checkPlain(raw: unknown): void {
  let visits = 0;
  let text = 0;
  const stack = new Set<object>();
  // A finished subtree's cost, so a shared one is counted on every visit without walking it again.
  const done = new Map<object, { visits: number; text: number; height: number }>();
  const add = (moreVisits: number, moreText: number): void => {
    visits += moreVisits;
    text += moreText;
    // Shared references count on every visit: `a = [a, a]` 32 times is acyclic and 2^32 visits.
    if (visits > LIMITS.cloneVisits) fail('Figure', `more than ${n(LIMITS.cloneVisits)} values; the limit is ${n(LIMITS.cloneVisits)}`);
    if (text > LIMITS.text) fail('Figure', `more than ${LIMITS.text / 1024} KiB of text; the limit is ${LIMITS.text / 1024} KiB`);
  };
  /** Returns the height of the subtree under `value`. */
  const visit = (value: unknown, depth: number): number => {
    if (typeof value !== 'object' || value === null) {
      if (typeof value === 'number' && !Number.isFinite(value)) fail('Figure', `a number is ${value}; numbers must be finite`);
      if (value !== null && value !== undefined && typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') fail('Figure', `a ${typeof value} cannot be drawn`);
      add(1, typeof value === 'string' ? value.length : 0);
      return 0;
    }
    if (stack.has(value)) fail('Figure', 'the data holds a cycle');
    const seen = done.get(value);
    if (seen) {
      add(seen.visits, seen.text);
      if (depth + seen.height > LIMITS.cloneDepth) fail('Figure', `data nested deeper than ${LIMITS.cloneDepth} levels`);
      return seen.height;
    }
    if (depth > LIMITS.cloneDepth) fail('Figure', `data nested deeper than ${LIMITS.cloneDepth} levels`);
    const proto: unknown = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (proto !== Array.prototype) fail('Figure', 'an array of an unknown kind cannot be drawn');
      for (let i = 0; i < value.length; i += 1) if (!Object.hasOwn(value, i)) fail('Figure', 'an array has holes');
    } else if (proto !== Object.prototype && proto !== null) {
      fail('Figure', `a ${Object.prototype.toString.call(value).slice(8, -1)} cannot be drawn`);
    }
    const before = { visits, text };
    add(1, 0);
    stack.add(value);
    let height = 0;
    for (const key of Object.keys(value)) height = Math.max(height, 1 + visit((value as Record<string, unknown>)[key], depth + 1));
    stack.delete(value);
    done.set(value, { visits: visits - before.visits, text: text - before.text, height });
    return height;
  };
  visit(raw, 0);
}

type Plain = Record<string, unknown>;

const isObject = (value: unknown): value is Plain => typeof value === 'object' && value !== null && !Array.isArray(value);
const own = (object: Plain, key: string): unknown => (Object.hasOwn(object, key) ? object[key] : undefined);

function onlyKeys(object: Plain, allowed: readonly string[], path: string, what: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) fail(path, `unknown prop "${key}"; ${what} takes ${allowed.join(', ')}`);
  }
}

function readFigure(raw: unknown): FigureData {
  if (!isObject(raw)) fail('Figure', 'the program returned no figure');
  onlyKeys(raw, ['params', 'title', 'frames'], 'Figure', 'a figure');
  const frames = own(raw, 'frames');
  if (!Array.isArray(frames) || frames.length === 0) fail('Figure', 'no steps');
  if (frames.length > LIMITS.steps) fail('Figure', over(frames.length, 'steps', LIMITS.steps));
  const title = own(raw, 'title');
  const figure = { elements: 0 };
  const steps = frames.map((frame, i) => readStep(frame, i, frames.length, figure));
  return {
    ...(title === undefined || title === null || title === '' ? {} : { title: plainString(title, 'Figure', 'title') }),
    params: readParams(own(raw, 'params')),
    steps,
  };
}

function plainString(value: unknown, path: string, what: string): string {
  if (typeof value !== 'string') fail(path, `${what} must be text`);
  if (value.length > LIMITS.string) fail(path, `${what} is ${over(value.length, 'characters', LIMITS.string)}`);
  return value;
}

const PARAM_KEY = /^[A-Za-z_$][\w$]{0,63}$/;

function readParams(raw: unknown): Param[] {
  if (raw === undefined || raw === null) return [];
  if (!isObject(raw)) fail('Figure', 'params must be an object');
  const keys = Object.keys(raw);
  if (keys.length > LIMITS.params) fail('Figure', over(keys.length, 'params', LIMITS.params));
  return keys.map((key): Param => {
    const path = `Figure > params.${key}`;
    if (!PARAM_KEY.test(key)) fail('Figure', `params name "${key}" is not a name`);
    const spec = raw[key];
    if (!isObject(spec)) fail(path, 'must be an object');
    const label = plainString(own(spec, 'label') ?? key, path, 'label');
    if (own(spec, 'text') === true) {
      onlyKeys(spec, ['label', 'value', 'text'], path, 'a text field');
      return { kind: 'text', key, label, value: plainString(own(spec, 'value') ?? '', path, 'value') };
    }
    if (Object.hasOwn(spec, 'options')) {
      onlyKeys(spec, ['label', 'options', 'value'], path, 'a choice');
      const options = own(spec, 'options');
      if (!Array.isArray(options) || options.length === 0) fail(path, 'options must be a list');
      if (options.length > LIMITS.options) fail(path, over(options.length, 'options', LIMITS.options));
      const read = options.map((option) => text(option, path, 'an option'));
      const value = own(spec, 'value') ?? read[0];
      if (!read.includes(value as Text)) fail(path, 'value is not one of its options');
      return { kind: 'choice', key, label, options: read, value: value as Text };
    }
    onlyKeys(spec, ['label', 'min', 'max', 'step', 'value', 'unit'], path, 'a slider');
    const min = number(own(spec, 'min'), path, 'min');
    const max = number(own(spec, 'max'), path, 'max');
    if (!(min < max)) fail(path, 'min must be below max');
    const step = own(spec, 'step') === undefined ? (max - min) / 100 : number(own(spec, 'step'), path, 'step');
    if (!(step > 0)) fail(path, 'step must be above 0');
    const value = own(spec, 'value') === undefined ? min : number(own(spec, 'value'), path, 'value');
    const unit = own(spec, 'unit');
    return { kind: 'slider', key, label, min, max, step, value, ...(unit === undefined ? {} : { unit: plainString(unit, path, 'unit') }) };
  });
}

function number(value: unknown, path: string, what: string): number {
  if (typeof value !== 'number') fail(path, `${what} must be a number`);
  return value;
}

function text(value: unknown, path: string, what: string): Text {
  if (typeof value === 'number') return value;
  return plainString(value, path, what);
}

const LAYOUT = ['Row', 'Column', 'Panel'] as const;
const SHARED = ['Shape', 'Circle', 'Vector', 'Segment', 'Points', 'Label'] as const;
const PLOT_ONLY = ['Fn', 'Region'] as const;
const DIAGRAM_ONLY = ['Angle', 'RightAngle', 'Tick', 'Dimension'] as const;


/** What one step's walk collects. */
interface StepScope {
  ids: Map<string, string>;
  targets: { path: string; id: string; what: string }[];
  anchors: number;
  elements: number;
}

function readStep(frame: unknown, index: number, count: number, figure: { elements: number }): Step {
  const path = `Step ${index + 1}`;
  if (!isObject(frame)) fail(path, 'a step must be an object');
  onlyKeys(frame, ['caption', 'heading', 'root'], path, 'a step');
  const scope: StepScope = { ids: new Map(), targets: [], anchors: 0, elements: 0 };
  const text = (key: 'caption' | 'heading'): string => {
    const value = own(frame, key) ?? '';
    if (typeof value !== 'string' && typeof value !== 'number') fail(path, `the ${key} must be text`);
    const shown = typeof value === 'number' ? formatFigure(value) : value;
    checkString(shown, path, `the ${key}`, scope, false);
    return shown;
  };
  const shown = text('caption');
  if (count > 1 && !shown.trim()) fail(path, 'a caption is required when a figure has two or more steps');
  const heading = text('heading').trim();
  const root = readNode(own(frame, 'root'), path, 1, null, scope);
  for (const target of scope.targets) {
    if (!scope.ids.has(target.id)) fail(target.path, `${target.what} "${target.id}" names no element, row, item or node in this step`);
  }
  figure.elements += scope.elements;
  if (figure.elements > LIMITS.elementsPerFigure) fail('Figure', `more than ${n(LIMITS.elementsPerFigure)} elements; the limit is ${n(LIMITS.elementsPerFigure)}`);
  return { caption: shown, ...(heading ? { heading } : {}), root, ids: new Set(scope.ids.keys()) };
}

/** Checks the maths in a string; anchors join the step's ids when they can be pointed at. */
function checkString(value: string, path: string, what: string, scope: StepScope, anchors = true, whole = false): void {
  if (value.length > LIMITS.string) fail(path, `${what} is ${over(value.length, 'characters', LIMITS.string)}`);
  // Renderers pair `$` signs differently, so a forbidden command anywhere in a string with maths fails, whatever the pairing.
  const problem = whole || value.includes('$') ? texProblems(value) : undefined;
  if (problem) fail(path, problem);
  for (const tex of whole ? [value] : texIn(value)) {
    for (const anchor of texAnchors(tex)) {
      if (!anchors) {
        if (!ID.test(anchor)) fail(path, `anchor "${anchor}" is not an id`);
        continue;
      }
      scope.anchors += 1;
      if (scope.anchors > LIMITS.anchorsPerStep) fail(path, over(scope.anchors, 'TeX anchors', LIMITS.anchorsPerStep));
      claim(anchor, path, scope);
    }
  }
}

function claim(id: unknown, path: string, scope: StepScope): string {
  if (typeof id !== 'string' || !ID.test(id)) fail(path, `id ${JSON.stringify(id)} is not an id: 1 to 64 letters, digits and _.:- starting with a letter or digit`);
  const first = scope.ids.get(id);
  if (first !== undefined) fail(path, `id "${id}" is used twice in this step (first at ${first})`);
  scope.ids.set(id, path);
  return id;
}

type Host = null | 'Plot' | 'Diagram';

function readNode(raw: unknown, parent: string, depth: number, host: Host, scope: StepScope): FigureNode;
function readNode(raw: unknown, parent: string, depth: number, host: 'Plot', scope: StepScope): PlotLayer;
function readNode(raw: unknown, parent: string, depth: number, host: 'Diagram', scope: StepScope): DiagramLayer;
function readNode(raw: unknown, parent: string, depth: number, host: Host, scope: StepScope): FigureNode | PlotLayer | DiagramLayer {
  if (!isObject(raw) || typeof own(raw, 'type') !== 'string') fail(parent, 'expected an element');
  onlyKeys(raw, ['type', 'props', 'children'], parent, 'an element');
  const type = raw.type as string;
  const props = own(raw, 'props') ?? {};
  const children = own(raw, 'children') ?? [];
  if (!isObject(props)) fail(parent, `<${type}> has props that are not an object`);
  if (!Array.isArray(children)) fail(parent, `<${type}> has children that are not a list`);
  if (type === 'Figure') fail(parent, 'Figure is returned once, outermost');
  if (!Object.hasOwn(ELEMENT_PROPS, type)) fail(parent, `unknown element <${type}>`);
  const rawId = own(props, 'id');
  const path = `${parent} > ${type}${typeof rawId === 'string' ? `#${rawId}` : ''}`;
  if (depth > LIMITS.depth) fail(path, `nesting depth ${depth}; the limit is ${LIMITS.depth}`);
  scope.elements += 1;
  if (scope.elements > LIMITS.elementsPerStep) fail(path, `more than ${n(LIMITS.elementsPerStep)} elements in a step; the limit is ${n(LIMITS.elementsPerStep)}`);
  onlyKeys(props, ELEMENT_PROPS[type], path, type);

  const isShared = (SHARED as readonly string[]).includes(type);
  const isLayer = isShared || (PLOT_ONLY as readonly string[]).includes(type) || (DIAGRAM_ONLY as readonly string[]).includes(type);
  if (host === null && isLayer) fail(path, `${type} is a layer and goes only inside a Plot or a Diagram`);
  if (host === 'Plot' && !isShared && !(PLOT_ONLY as readonly string[]).includes(type)) fail(path, `${type} cannot go inside a Plot`);
  if (host === 'Diagram' && !isShared && !(DIAGRAM_ONLY as readonly string[]).includes(type)) fail(path, `${type} cannot go inside a Diagram`);
  if (isLayer && children.length) fail(path, `${type} takes no children`);
  if (!isLayer && !(LAYOUT as readonly string[]).includes(type) && type !== 'Text' && type !== 'Plot' && type !== 'Diagram' && children.length) fail(path, `${type} takes no children`);

  const read = new Reader(props, path, scope);
  const id = rawId === undefined ? {} : { id: claim(rawId, path, scope) };

  switch (type) {
    case 'Row':
    case 'Column':
      return { type, ...id, ...read.optional('gap', (v) => read.choice(v, 'gap', ['sm', 'md', 'lg'])), ...read.optional('align', (v) => read.choice(v, 'align', ['start', 'center', 'end'])), children: blocks(children, path, depth, scope) };
    case 'Panel':
      return { type, ...id, ...read.optional('title', (v) => read.string(v, 'title')), ...read.tag(), children: blocks(children, path, depth, scope) };
    case 'Table': {
      const columns = read.list('columns', 1, LIMITS.tableColumns, 'columns', (v) => read.text(v, 'a column'));
      const rows = read.list('rows', 0, LIMITS.tableRows, 'rows', (row, r) => {
        if (!Array.isArray(row) || row.length !== columns.length) fail(path, `row ${r + 1} must have ${columns.length} cells, one per column`);
        return row.map((cell) => (cell === null ? null : read.text(cell, 'a cell')));
      });
      const rowIds = read.list('rowIds', 0, LIMITS.tableRows, 'rowIds', (rowId) => claim(rowId, path, scope));
      if (rowIds.length !== rows.length) fail(path, `${rows.length} rows but ${rowIds.length} rowIds; give one id per row`);
      for (const rowId of rowIds) for (let c = 0; c < columns.length; c += 1) claim(`${rowId}.${c}`, path, scope);
      return { type, ...id, ...read.optional('title', (v) => read.string(v, 'title')), columns, rows, rowIds, tags: read.tags() };
    }
    case 'Seq': {
      const items = read.list('items', 0, LIMITS.seqItems, 'items', (item) => {
        if (!isObject(item)) fail(path, 'an item must be {id, label}');
        onlyKeys(item, ['id', 'label'], path, 'an item');
        return { id: claim(own(item, 'id'), path, scope), label: read.text(own(item, 'label'), 'an item label') };
      });
      const index = own(props, 'index');
      const shownIndex = index === undefined || index === false ? {} : index === true ? { index: true as const } : { index: read.list('index', 0, LIMITS.seqItems, 'index labels', (v) => read.text(v, 'an index label')) };
      return { type, ...id, ...read.optional('title', (v) => read.string(v, 'title')), items, ...shownIndex, tags: read.tags() };
    }
    case 'Node':
      return { type, ...id, label: read.text(own(props, 'label'), 'label'), ...read.optional('sub', (v) => read.text(v, 'sub')), ...read.optional('shape', (v) => read.choice(v, 'shape', ['box', 'circle'])), ...read.tag() };
    case 'Text': {
      const fromProp = own(props, 'text');
      const value = fromProp === undefined
        ? children.map((child) => (typeof child === 'number' ? formatFigure(child) : typeof child === 'string' ? child : fail(path, 'Text holds only text'))).join('')
        : typeof fromProp === 'number' ? formatFigure(fromProp) : read.string(fromProp, 'text');
      if (fromProp !== undefined && children.length) fail(path, 'give Text its text as a prop or as children, not both');
      if (!value.trim()) fail(path, 'Text is empty');
      checkString(value, path, 'text', scope);
      return { type, ...id, text: value };
    }
    case 'Tex': {
      const tex = own(props, 'tex');
      if (typeof tex !== 'string' || !tex.trim()) fail(path, 'tex must be TeX');
      checkString(tex, path, 'tex', scope, true, true);
      return { type, ...id, tex };
    }
    case 'Graph': {
      const nodes = read.list('nodes', 1, LIMITS.graphNodes, 'nodes', (node): GraphNode => {
        if (!isObject(node)) fail(path, 'a node must be {id, label, sub}');
        onlyKeys(node, ['id', 'label', 'sub'], path, 'a node');
        const sub = own(node, 'sub');
        return { id: claim(own(node, 'id'), path, scope), label: read.text(own(node, 'label') ?? own(node, 'id'), 'a node label'), ...(sub === undefined ? {} : { sub: read.text(sub, 'a node sub') }) };
      });
      const known = new Set(nodes.map((node) => node.id));
      const edges = read.list('edges', 0, LIMITS.graphEdges, 'edges', (edge, e): GraphEdge => {
        if (!isObject(edge)) fail(path, 'an edge must be {id, from, to, label, directed}');
        onlyKeys(edge, ['id', 'from', 'to', 'label', 'directed'], path, 'an edge');
        const from = own(edge, 'from');
        const to = own(edge, 'to');
        for (const end of [from, to]) if (typeof end !== 'string' || !known.has(end)) fail(path, `edge ${e + 1} joins ${JSON.stringify(end)}, which is no node of this Graph`);
        const edgeId = own(edge, 'id');
        const label = own(edge, 'label');
        const directed = own(edge, 'directed');
        if (directed !== undefined && typeof directed !== 'boolean') fail(path, 'directed must be true or false');
        return { ...(edgeId === undefined ? {} : { id: claim(edgeId, path, scope) }), from: from as string, to: to as string, ...(label === undefined ? {} : { label: read.text(label, 'an edge label') }), ...(directed === undefined ? {} : { directed }) };
      });
      return { type, ...id, nodes, edges, tags: read.tags() };
    }
    case 'Quiz': {
      const options = read.list('options', 2, LIMITS.quizOptions, 'options', (v) => read.text(v, 'an option'));
      const correct = own(props, 'correct');
      if (!options.includes(correct as Text)) fail(path, 'correct must be one of its options');
      return { type, ...id, question: read.string(own(props, 'question'), 'question'), options, correct: correct as Text, ...read.optional('explanation', (v) => read.string(v, 'explanation')) };
    }
    case 'Arrow':
      return { type, from: read.target('from'), to: read.target('to'), ...read.optional('label', (v) => read.text(v, 'label')), ...read.tag() };
    case 'Pointer':
      return { type, to: read.target('to'), name: read.text(own(props, 'name'), 'name'), ...read.tag() };
    case 'Plot': {
      const layers = drawingLayers(children, path, depth, 'Plot', scope);
      const fns = new Set(layers.flatMap((layer) => (layer.type === 'Fn' && layer.id ? [layer.id] : [])));
      for (const layer of layers) {
        if (layer.type !== 'Region') continue;
        for (const key of ['top', 'base'] as const) {
          const value = layer[key];
          if (typeof value === 'string' && !fns.has(value)) fail(path, `Region "${key}" names no Fn of this Plot: "${value}"`);
        }
      }
      return { type, ...id, x: read.range('x'), ...read.optional('y', () => read.range('y')), ...read.optional('xLabel', (v) => read.string(v, 'xLabel')), ...read.optional('yLabel', (v) => read.string(v, 'yLabel')), children: layers };
    }
    case 'Diagram':
      return { type, ...id, width: read.positive('width'), height: read.positive('height'), children: drawingLayers(children, path, depth, 'Diagram', scope) };
    case 'Shape':
      return { type, ...id, pts: read.points('pts', LIMITS.shapePoints), ...read.optional('closed', (v) => read.boolean(v, 'closed')), ...read.marks() };
    case 'Circle':
      return { type, ...id, at: read.point('at'), r: read.positive('r'), ...read.marks() };
    case 'Vector':
    case 'Segment':
      return { type, ...id, from: read.point('from'), to: read.point('to'), ...read.marks() };
    case 'Points':
      return { type, ...id, pts: read.points('pts', LIMITS.layerPoints), ...read.marks() };
    case 'Label':
      return { type, ...id, at: read.point('at'), text: read.text(own(props, 'text'), 'text'), ...read.tag() };
    case 'Fn': {
      const pts = read.list('pts', 0, LIMITS.fnSamples, 'samples', (sample): readonly [number, number | null] => {
        if (!Array.isArray(sample) || sample.length !== 2 || typeof sample[0] !== 'number' || (sample[1] !== null && typeof sample[1] !== 'number')) fail(path, 'Fn samples must be [x, y]');
        return [sample[0], sample[1] as number | null];
      });
      return { type, ...id, pts, ...read.optional('from', (v) => number(v, path, 'from')), ...read.optional('to', (v) => number(v, path, 'to')), ...read.marks() };
    }
    case 'Region': {
      const end = (value: unknown, key: string): string | number => (typeof value === 'number' ? value : typeof value === 'string' ? value : fail(path, `${key} must be an Fn id or a number`));
      if (own(props, 'top') === undefined) fail(path, 'Region needs top: an Fn id or a number');
      return { type, ...id, top: end(own(props, 'top'), 'top'), ...read.optional('base', (v) => end(v, 'base')), ...read.optional('from', (v) => number(v, path, 'from')), ...read.optional('to', (v) => number(v, path, 'to')), ...read.marks() };
    }
    case 'Angle':
      return { type, ...id, at: read.point('at'), from: read.point('from'), to: read.point('to'), ...read.marks() };
    case 'RightAngle':
      return { type, ...id, at: read.point('at'), from: read.point('from'), to: read.point('to'), ...read.tag() };
    case 'Tick': {
      const on = own(props, 'on');
      if (!Array.isArray(on) || on.length !== 2) fail(path, 'on must be [[x, y], [x, y]]');
      const n = own(props, 'n');
      if (n !== undefined && !(Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 8)) fail(path, 'n must be a whole number from 1 to 8');
      return { type, ...id, on: [read.point('on', on[0]), read.point('on', on[1])], ...(n === undefined ? {} : { n: n as number }), ...read.tag() };
    }
    case 'Dimension':
      return { type, ...id, from: read.point('from'), to: read.point('to'), ...read.optional('label', (v) => read.text(v, 'label')), ...read.tag() };
  }
  fail(path, `unknown element <${type}>`);
}

/** Children of a layout element: elements, with bare text as a paragraph. */
function blocks(children: unknown[], path: string, depth: number, scope: StepScope): FigureNode[] {
  return children.map((child) => readNode(typeof child === 'string' || typeof child === 'number' ? { type: 'Text', props: { text: child }, children: [] } : child, path, depth + 1, null, scope));
}

function drawingLayers(children: unknown[], path: string, depth: number, host: 'Plot', scope: StepScope): PlotLayer[];
function drawingLayers(children: unknown[], path: string, depth: number, host: 'Diagram', scope: StepScope): DiagramLayer[];
function drawingLayers(children: unknown[], path: string, depth: number, host: 'Plot' | 'Diagram', scope: StepScope): (PlotLayer | DiagramLayer)[] {
  if (children.length > LIMITS.layers) fail(path, over(children.length, 'layers', LIMITS.layers));
  return children.map((child) => (host === 'Plot' ? readNode(child, path, depth + 1, host, scope) : readNode(child, path, depth + 1, host, scope)));
}

/** Typed reads of one element's props, all by `Object.hasOwn`. */
class Reader {
  constructor(private readonly props: Plain, private readonly path: string, private readonly scope: StepScope) {}

  optional<K extends string, V>(key: K, read: (value: unknown) => V): { [P in K]?: V } {
    const value = own(this.props, key);
    return (value === undefined || value === null ? {} : { [key]: read(value) }) as { [P in K]?: V };
  }

  string(value: unknown, what: string): string {
    const read = plainString(value, this.path, what);
    checkString(read, this.path, what, this.scope);
    return read;
  }

  text(value: unknown, what: string): Text {
    if (typeof value === 'number') return value;
    return this.string(value, what);
  }

  choice<const T extends string>(value: unknown, what: string, options: readonly T[]): T {
    if (!options.includes(value as T)) fail(this.path, `${what} must be one of ${options.join(', ')}`);
    return value as T;
  }

  boolean(value: unknown, what: string): boolean {
    if (typeof value !== 'boolean') fail(this.path, `${what} must be true or false`);
    return value;
  }

  positive(key: string): number {
    const value = own(this.props, key);
    if (typeof value !== 'number' || !(value > 0)) fail(this.path, `${key} must be a number above 0`);
    return value;
  }

  point(key: string, value: unknown = own(this.props, key)): Point {
    if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'number' || typeof value[1] !== 'number') fail(this.path, `${key} must be a point [x, y]`);
    return [value[0], value[1]];
  }

  points(key: string, limit: number): Point[] {
    return this.list(key, 0, limit, 'points', (value) => this.point(key, value));
  }

  range(key: string): Point {
    const range = this.point(key);
    if (!(range[0] < range[1])) fail(this.path, `${key} must be [low, high] with low below high`);
    return range;
  }

  list<T>(key: string, min: number, limit: number, what: string, read: (value: unknown, index: number) => T): T[] {
    const value = own(this.props, key);
    if (!Array.isArray(value)) fail(this.path, `${key} must be a list`);
    if (value.length > limit) fail(this.path, over(value.length, what, limit));
    if (value.length < min) fail(this.path, `${key} needs at least ${min}`);
    return value.map(read);
  }

  tag(): { tag?: Tag } {
    return this.optional('tag', (value) => this.choice(value, 'tag', TAGS));
  }

  marks(): { label?: Text; tag?: Tag } {
    return { ...this.optional('label', (value) => this.text(value, 'label')), ...this.tag() };
  }

  /** An id another element must hold in this step; checked when the step is done. */
  target(key: string): string {
    const value = own(this.props, key);
    if (typeof value !== 'string') fail(this.path, `${key} must be an id`);
    this.scope.targets.push({ path: this.path, id: value, what: key });
    return value;
  }

  tags(): Tags {
    const value = own(this.props, 'tags');
    const tags = new Map<string, Tag>();
    if (value === undefined || value === null) return tags;
    if (!isObject(value)) fail(this.path, 'tags must be an object of id: tag');
    for (const key of Object.keys(value)) {
      const tag = value[key];
      if (tag === null || tag === undefined) continue;
      tags.set(key, this.choice(tag, `tags "${key}"`, TAGS));
      this.scope.targets.push({ path: this.path, id: key, what: 'tags' });
    }
    return tags;
  }
}
