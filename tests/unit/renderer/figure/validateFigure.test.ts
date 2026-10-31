import { LIMITS } from '@/renderer/figure/FigureData';
import { validateFigure } from '@/renderer/figure/validateFigure';

type El = { type: string; props: Record<string, unknown>; children: unknown[] };
const el = (type: string, props: Record<string, unknown> = {}, ...children: unknown[]): El => ({ type, props, children });
const figure = (root: unknown, more: Record<string, unknown> = {}): Record<string, unknown> => ({ params: {}, frames: [{ caption: '', root }], ...more });
const node = (id = 'a'): El => el('Node', { id, label: 'x' });

function errorOf(raw: unknown): string {
  const result = validateFigure(raw);
  if (result.ok) throw new Error('expected a failure');
  return result.error;
}

function expectOk(raw: unknown): void {
  const result = validateFigure(raw);
  expect(result.ok ? 'ok' : result.error).toBe('ok');
}

const table = (rows: number, columns: number, tags: Record<string, string> = {}): El => el('Table', {
  id: 't',
  columns: Array.from({ length: columns }, (_, c) => `c${c}`),
  rows: Array.from({ length: rows }, () => Array.from({ length: columns }, () => 1)),
  rowIds: Array.from({ length: rows }, (_, r) => `r${r}`),
  tags,
});

const nested = (depth: number): El => (depth === 1 ? node() : el('Row', {}, nested(depth - 1)));
const plot = (...layers: El[]): El => el('Plot', { id: 'p', x: [0, 1] }, ...layers);
const diagram = (...layers: El[]): El => el('Diagram', { id: 'd', width: 4, height: 3 }, ...layers);

describe('validateFigure limits', () => {
  const cases: [string, (n: number) => unknown, number, string][] = [
    ['steps', (n) => ({ params: {}, frames: Array.from({ length: n }, (_, i) => ({ caption: `s${i}`, root: node() })) }), LIMITS.steps, 'Figure: 65 steps; the limit is 64'],
    ['elements in a step', (n) => figure(el('Row', {}, ...Array.from({ length: n - 1 }, (_, i) => el('Text', { text: `t${i}` })))), LIMITS.elementsPerStep, 'more than 4,000 elements in a step'],
    ['string length', (n) => figure(el('Text', { text: 'a'.repeat(n) })), LIMITS.string, 'text is 2,001 characters; the limit is 2,000'],
    ['layers', (n) => figure(plot(...Array.from({ length: n }, () => el('Label', { at: [0, 0], text: 'x' })))), LIMITS.layers, '257 layers; the limit is 256'],
    ['points', (n) => figure(plot(el('Points', { pts: Array.from({ length: n }, () => [0, 0]) }))), LIMITS.layerPoints, '2,001 points; the limit is 2,000'],
    ['shape points', (n) => figure(plot(el('Shape', { pts: Array.from({ length: n }, () => [0, 0]) }))), LIMITS.shapePoints, '257 points; the limit is 256'],
    ['Seq items', (n) => figure(el('Seq', { id: 's', items: Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: i })) })), LIMITS.seqItems, 'Step 1 > Seq#s: 129 items; the limit is 128'],
    ['Table rows', (n) => figure(table(n, 2)), LIMITS.tableRows, '65 rows; the limit is 64'],
    ['Table columns', (n) => figure(table(2, n)), LIMITS.tableColumns, '17 columns; the limit is 16'],
    ['Graph nodes', (n) => figure(el('Graph', { id: 'g', nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: i })), edges: [] })), LIMITS.graphNodes, '129 nodes; the limit is 128'],
    ['Graph edges', (n) => figure(el('Graph', { id: 'g', nodes: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }], edges: Array.from({ length: n }, () => ({ from: 'a', to: 'b' })) })), LIMITS.graphEdges, '513 edges; the limit is 512'],
    ['params', (n) => figure(node(), { params: Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, { label: 'p', min: 0, max: 1, value: 0 }])) }), LIMITS.params, '9 params; the limit is 8'],
    ['options', (n) => figure(node(), { params: { c: { label: 'c', options: Array.from({ length: n }, (_, i) => `o${i}`), value: 'o0' } } }), LIMITS.options, '13 options; the limit is 12'],
    ['Quiz options', (n) => figure(el('Quiz', { question: 'q', options: Array.from({ length: n }, (_, i) => `o${i}`), correct: 'o0' })), LIMITS.quizOptions, '9 options; the limit is 8'],
    ['depth', (n) => figure(nested(n)), LIMITS.depth, 'nesting depth 33; the limit is 32'],
    ['TeX anchors', (n) => figure(el('Tex', { tex: Array.from({ length: n }, (_, i) => `\\cssId{a${i}}{x}`).join('+') })), LIMITS.anchorsPerStep, '65 TeX anchors; the limit is 64'],
  ];

  it.each(cases)('accepts %s at the limit and names the limit one over', (_, make, limit, message) => {
    expectOk(make(limit));
    expect(errorOf(make(limit + 1))).toContain(message);
  });

  it('stops a payload of shared subtrees by counting every visit', () => {
    let shared: unknown[] = [];
    for (let i = 0; i < 32; i += 1) shared = [shared, shared];
    const started = performance.now();
    const error = errorOf(figure(el('Table', { id: 't', columns: ['a'], rows: [[shared]], rowIds: ['r'] })));
    expect(performance.now() - started).toBeLessThan(100);
    expect(error).toBe('Figure: more than 2,000,000 values; the limit is 2,000,000');
  });
});

describe('validateFigure on adversarial clones', () => {
  it('rejects an own __proto__ prop without polluting Object.prototype', () => {
    const raw = JSON.parse('{"params":{},"frames":[{"caption":"","root":{"type":"Node","props":{"label":"x","__proto__":{"polluted":true}},"children":[]}}]}') as unknown;
    expect(errorOf(raw)).toContain('unknown prop "__proto__"');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each<[string, unknown, string]>([
    ['a constructor prop', figure(el('Node', { label: 'x', constructor: 'y' })), 'unknown prop "constructor"'],
    ['a cycle', (() => { const loop: unknown[] = []; loop.push(loop); return figure(el('Table', { columns: ['a'], rows: [[loop]], rowIds: ['r'] })); })(), 'the data holds a cycle'],
    ['NaN', figure(el('Node', { label: NaN })), 'a number is NaN'],
    ['Infinity', figure(el('Node', { label: Infinity })), 'a number is Infinity'],
    ['a sparse array', figure(el('Seq', { items: [, { id: 'a', label: 'a' }] })), 'an array has holes'],
    ['a Map', figure(el('Node', { label: new Map() })), 'a Map cannot be drawn'],
    ['a Date', figure(el('Node', { label: new Date(0) })), 'a Date cannot be drawn'],
    ['a function', figure(el('Node', { label: () => 1 })), 'a function cannot be drawn'],
    ['a tag key inherited from Object.prototype', figure(el('Table', { id: 't', columns: ['a'], rows: [], rowIds: [], tags: { constructor: 'good' } })), 'tags "constructor" names no element, row, item or node in this step'],
    ['an unknown element', figure(el('Matrix', {})), 'unknown element <Matrix>'],
    ['a nested Figure', figure(el('Row', {}, el('Figure', {}))), 'Figure is returned once, outermost'],
  ])('rejects %s', (_, raw, message) => {
    expect(errorOf(raw)).toContain(message);
  });

  it('names the path to the failing element', () => {
    expect(errorOf(figure(el('Row', {}, table(1, 1, { 't-X': 'good' }))))).toBe('Step 1 > Row > Table#t: tags "t-X" names no element, row, item or node in this step');
    expect(errorOf(figure(plot(el('Region', { top: 'g', from: 0, to: 1 }))))).toBe('Step 1 > Plot#p: Region "top" names no Fn of this Plot: "g"');
  });
});

describe('validateFigure ids', () => {
  it('accepts a Table without rowIds', () => {
    expectOk(figure(el('Table', { columns: ['a', 'b'], rows: [[1, 2]] })));
    expectOk(figure(el('Table', { id: 't', columns: ['a'], rows: [[1]], tags: { t: 'active' } })));
  });

  it('rejects an id used by a Seq item and a Node', () => {
    expect(errorOf(figure(el('Row', {}, el('Seq', { items: [{ id: 'a', label: 1 }] }), node('a'))))).toContain('id "a" is used twice in this step');
  });

  it('rejects an Arrow to an id that is not in the step', () => {
    expect(errorOf(figure(el('Row', {}, node('a'), el('Arrow', { from: 'a', to: 'b' }))))).toBe('Step 1 > Row > Arrow: to "b" names no element, row, item or node in this step');
  });

  it('resolves cell ids by 0-based column', () => {
    const pointed = (id: string): unknown => figure(el('Row', {}, table(3, 4), el('Pointer', { to: id, name: 'here' })));
    expectOk(pointed('r2.3'));
    expect(errorOf(pointed('r2.4'))).toContain('"r2.4" names no element');
    expect(errorOf(pointed('r2.99'))).toContain('"r2.99" names no element');
  });

  it('keeps layers to their drawings', () => {
    expectOk(figure(plot(el('Shape', { pts: [[0, 0]] }))));
    expect(errorOf(figure(diagram(el('Fn', { pts: [] }))))).toContain('Fn cannot go inside a Diagram');
    expect(errorOf(figure(el('Shape', { pts: [] })))).toContain('goes only inside a Plot or a Diagram');
  });

  it("rejects a Region naming another Plot's Fn", () => {
    const other = el('Plot', { id: 'q', x: [0, 1] }, el('Fn', { id: 'g', pts: [[0, 0]] }));
    expect(errorOf(figure(el('Row', {}, other, plot(el('Region', { top: 'g' })))))).toContain('Region "top" names no Fn of this Plot: "g"');
  });

  it('counts a TeX anchor as an id', () => {
    expectOk(figure(el('Row', {}, el('Tex', { tex: '\\cssId{r2}{0}' }), el('Pointer', { to: 'r2', name: 'R2' }))));
    expect(errorOf(figure(el('Row', {}, el('Tex', { tex: '\\cssId{a}{0}' }), node('a'))))).toContain('id "a" is used twice in this step');
  });
});

describe('validateFigure output', () => {
  it('reads tags into a Map and text children into text', () => {
    const result = validateFigure(figure(el('Row', {}, el('Text', {}, 'Total: ', 0.1 + 0.2), table(1, 1, { r0: 'good' }))));
    if (!result.ok) throw new Error(result.error);
    const root = result.figure.steps[0].root;
    if (root.type !== 'Row') throw new Error('expected a Row');
    expect(root.children[0]).toEqual({ type: 'Text', text: 'Total: 0.3' });
    expect(root.children[1]).toMatchObject({ type: 'Table', tags: new Map([['r0', 'good']]) });
    expect(result.figure.steps[0].ids).toEqual(new Set(['t', 'r0', 'r0.0']));
  });

  it('reads params', () => {
    const result = validateFigure(figure(node(), { params: { n: { label: 'n', min: 1, max: 8, step: 1, value: 3 }, mode: { label: 'Mode', options: ['a', 'b'], value: 'b' }, name: { label: 'Name', value: 'x', text: true } } }));
    if (!result.ok) throw new Error(result.error);
    expect(result.figure.params).toEqual([
      { kind: 'slider', key: 'n', label: 'n', min: 1, max: 8, step: 1, value: 3 },
      { kind: 'choice', key: 'mode', label: 'Mode', options: ['a', 'b'], value: 'b' },
      { kind: 'text', key: 'name', label: 'Name', value: 'x' },
    ]);
  });

  it('requires a caption on every step of a stepped figure', () => {
    expect(errorOf({ params: {}, frames: [{ caption: 'one', root: node() }, { caption: ' ', root: node() }] })).toBe('Step 2: a caption is required when a figure has two or more steps');
  });

  it('refuses a forbidden TeX command a different pairing of $ signs would hide', () => {
    expect(errorOf({ params: {}, frames: [{ caption: 'pay $5 and $\\style{color:red}{x}$', root: node() }] })).toMatch(/\\style is not allowed/);
  });

  it('keeps a step heading, leaves out a blank one, and refuses one that is not text', () => {
    const result = validateFigure({ params: {}, frames: [{ caption: 'one', heading: 'First', root: node() }, { caption: 'two', heading: ' ', root: node() }] });
    if (!result.ok) throw new Error(result.error);
    expect(result.figure.steps.map((step) => step.heading)).toEqual(['First', undefined]);
    expect(errorOf({ params: {}, frames: [{ caption: 'one', heading: ['x'], root: node() }] })).toBe('Step 1: the heading must be text');
  });
});
