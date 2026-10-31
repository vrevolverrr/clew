import { WORKER_SOURCE } from '@/renderer/figure/sandboxSource';
import { validateFigure } from '@/renderer/figure/validateFigure';

import { runFigureWorker } from '../../../runFigureWorker';

type Reply = { error?: { message: string; line?: number }; params?: unknown; frames?: { caption: string; root: { type: string; props: Record<string, unknown>; children: unknown[] } }[] };

const run = (source: string, params: Record<string, unknown> = {}): Promise<Reply> => runFigureWorker(WORKER_SOURCE, { kind: 'run', source, params }) as Promise<Reply>;

const DIJKSTRA = `
const nodes = ['A', 'B', 'C', 'D', 'E'];
const edges = [['A', 'B', 2], ['A', 'C', 3], ['B', 'D', 3], ['C', 'D', 4], ['D', 'E', 1]];
const source = 'A';

export default function () {
  const d = Object.fromEntries(nodes.map(n => [n, n === source ? 0 : Infinity]));
  const done = [];
  const show = v => v === Infinity ? '∞' : v;
  const steps = [{ d: { ...d }, done: [], text: \`Start: \${source} is 0 away, every other node ∞.\` }];
  while (done.length < nodes.length) {
    const u = nodes.filter(n => !done.includes(n)).sort((a, b) => d[a] - d[b])[0];
    done.push(u);
    const changed = [];
    for (const [a, b, w] of edges) for (const [x, y] of [[a, b], [b, a]]) if (x === u && !done.includes(y) && d[u] + w < d[y]) { d[y] = d[u] + w; changed.push(\`\${y} → \${d[y]}\`); }
    steps.push({ d: { ...d }, done: [...done], u, text: \`Settle **\${u}** at \${show(d[u])}. \${changed.length ? \`Relaxed: \${changed.join(', ')}.\` : 'No distance improves.'}\` });
  }
  return <Figure steps={steps} caption={step => step.text} render={step => (
    <Row gap="lg" align="center">
      <Graph id="g" nodes={nodes.map(n => ({ id: \`g-\${n}\`, label: n }))} edges={edges.map(([a, b, w], i) => ({ id: \`e\${i}\`, from: \`g-\${a}\`, to: \`g-\${b}\`, label: w }))}
        tags={Object.fromEntries(nodes.map(n => [\`g-\${n}\`, n === step.u ? 'active' : step.done.includes(n) ? 'done' : null]))} />
      <Table id="dist" title="Distance" columns={['Node', 'Distance']} rows={nodes.map(n => [n, show(step.d[n])])} rowIds={nodes.map(n => \`t-\${n}\`)}
        tags={Object.fromEntries(nodes.map(n => [\`t-\${n}\`, n === step.u ? 'active' : step.done.includes(n) ? 'done' : null]))} />
    </Row>
  )} />;
}
`;

describe('the figure worker', () => {
  it('runs the Dijkstra reference to its final distances, and the result validates', async () => {
    const reply = await run(DIJKSTRA);
    expect(reply.error).toBeUndefined();
    expect(reply.frames).toHaveLength(6);
    const last = reply.frames!.at(-1)!.root.children[1] as { props: { rows: [string, number][] } };
    expect(last.props.rows.map((row) => row[1])).toEqual([0, 2, 3, 5, 6]);
    const result = validateFigure(reply);
    expect(result.ok ? 'ok' : result.error).toBe('ok');
  });

  it('keeps one TeX backslash in a quoted attribute and in String.raw, as the prompt says', async () => {
    const reply = await run(String.raw`export default () => <Column><Text text="$A \cap B$" /><Text text={String.raw` + '`$\\frac{${1}}{2}$`' + String.raw`} /></Column>;`);
    expect(reply.frames![0].root.children.map((child) => (child as { props: { text: string } }).props.text)).toEqual(['$A \\cap B$', '$\\frac{1}{2}$']);
  });

  it('splices a fragment inside a Diagram, so a map can return two layers', async () => {
    const reply = await run('export default () => <Diagram width={2} height={1}>{[0, 1].map(x => <><Segment from={[x, 0]} to={[x, 1]} /><Points pts={[[x, 1]]} /></>)}</Diagram>;');
    expect(reply.frames![0].root.children.map((child) => (child as { type: string }).type)).toEqual(['Segment', 'Points', 'Segment', 'Points']);
    expect(validateFigure(reply).ok).toBe(true);
  });

  it('reads declared params, and the values the host sends', async () => {
    const source = `export const params = { n: { label: 'n', min: 1, max: 8, step: 1, value: 3 } };
export default function ({ n }) {
  return <Figure steps={Array.from({ length: n }, (_, i) => i)} caption={step => \`Step \${step}\`} render={step => <Node id="a" label={step} />} />;
}`;
    expect((await run(source)).frames).toHaveLength(3);
    expect((await run(source, { n: 5 })).frames).toHaveLength(5);
  });

  it('samples an Fn at 161 points, with null where it is not finite', async () => {
    const reply = await run('export default () => <Plot id="p" x={[-1, 1]}><Fn id="f" f={x => 1 / x} /></Plot>;');
    const pts = (reply.frames![0].root.children[0] as { props: { pts: [number, number | null][]; f?: unknown } }).props;
    expect(pts.pts).toHaveLength(161);
    expect(pts.pts[80]).toEqual([0, null]);
    expect(pts.f).toBeUndefined();
  });

  describe('a function of two variables', () => {
    const fnProps = async (fn: string, plot = 'x={[0, 1]} y={[0, 2]}'): Promise<Record<string, unknown>> => {
      const reply = await run(`export default () => <Plot ${plot}>${fn}</Plot>;`);
      if (reply.error) throw new Error(reply.error.message);
      return (reply.frames![0].root.children[0] as { props: Record<string, unknown> }).props;
    };
    const errorOf = async (fn: string): Promise<string | undefined> => (await run(`export default () => <Plot x={[0, 1]} y={[0, 1]}>${fn}</Plot>;`)).error?.message;

    it('samples a graph on a 49 × 49 grid over the box, x along a row, with null in its holes', async () => {
      const { zs, pts } = await fnProps('<Fn f={(x, y) => x * y} />') as { zs: (number | null)[]; pts?: unknown };
      expect(pts).toBeUndefined();
      expect(zs).toHaveLength(49 * 49);
      expect([zs[0], zs[48], zs[48 * 49], zs.at(-1)]).toEqual([0, 0, 0, 2]);
      expect(zs[49 + 48]).toBeCloseTo(2 / 48);
      const holes = await fnProps('<Fn f={(x, y) => 1 / (x * x + y * y)} />', 'x={[-1, 1]} y={[-1, 1]}') as { zs: (number | null)[] };
      expect(holes.zs[24 * 49 + 24]).toBeNull();
      expect(holes.zs.filter((z) => z === null)).toHaveLength(1);
    });

    it('narrows a graph to from and to', async () => {
      const { zs } = await fnProps('<Fn f={(x, y) => x} from={0.5} to={1} />') as { zs: number[] };
      expect([zs[0], zs[48]]).toEqual([0.5, 1]);
    });

    it('counts plain parameters only, so a default value makes a curve', async () => {
      const props = await fnProps('<Fn f={(x, y = 0) => x + y} />');
      expect((props.pts as unknown[]).length).toBe(161);
    });

    it('is parametric when its first finite sample is a point, and keeps a sphere whole at its poles and seam', async () => {
      const sphere = await fnProps('<Fn id="s" u={[0, 2 * Math.PI]} v={[0, Math.PI]} f={(u, v) => [Math.cos(u) * Math.sin(v), Math.sin(u) * Math.sin(v), Math.cos(v)]} />', '') as { pts: [number, number, number][]; u: number[] };
      expect(sphere.pts).toHaveLength(49 * 49);
      expect(sphere.u).toEqual([0, 2 * Math.PI]);
      for (let i = 0; i <= 48; i += 1) {
        expect(sphere.pts[i][2]).toBeCloseTo(1);
        expect(sphere.pts[48 * 49 + i][2]).toBeCloseTo(-1);
      }
      for (let j = 0; j <= 48; j += 1) sphere.pts[j * 49].forEach((c, k) => expect(sphere.pts[j * 49 + 48][k]).toBeCloseTo(c));
      const holed = await fnProps('<Fn u={[0, 1]} v={[0, 1]} f={(u, v) => u < 0.5 ? NaN : [u, v, 0]} />') as { pts: unknown[] };
      expect(holed.pts[0]).toBeNull();
      expect(holed.pts[48]).toEqual([1, 0, 0]);
    });

    it('names the Fn whose samples mix numbers and points', async () => {
      expect(await errorOf('<Fn id="m" f={(x, y) => x < 0.5 ? x : [x, y, 0]} />')).toMatch(/^Fn `m` returned a point at \(0\.5, 0\) after returning numbers/);
      expect(await errorOf('<Fn id="m" f={(x, y) => x < 0.5 ? [x, y, 0] : 1} />')).toMatch(/^Fn `m` returned a number at \(0\.5, 0\) after returning points/);
      expect(await errorOf('<Fn f={(x, y) => [x, y]} />')).toMatch(/^Fn returned a point with 2 coordinates/);
    });

    it('drops pts and zs the program wrote', async () => {
      const props = await fnProps('<Fn f={x => x} zs={[1]} pts={[[0, 9]]} />');
      expect(props.zs).toBeUndefined();
      expect((props.pts as unknown[]).length).toBe(161);
    });
  });

  it('reports the line of a syntax error and of a runtime error', async () => {
    expect((await run('export default function () {\n  const a = 1;\n  const b = 2;\n  return <Node label={a b} />;\n}')).error).toMatchObject({ line: 4, message: expect.stringMatching(/^Syntax error: /) as unknown });
    const runtime = await run('export default function () {\n  return <Figure steps={[1, 2]} caption={s => "c" + s} render={step => {\n    const n = step;\n\n\n    if (step === 2) {\n      return n.nope.deeper;\n    }\n    return <Node label="x" />;\n  }} />;\n}');
    expect(runtime.error).toEqual({ message: "Step 2: TypeError: Cannot read properties of undefined (reading 'deeper')", line: 7 });
  });

  it('names a variable that shadows an element', async () => {
    expect((await run('const Node = 1;\nexport default () => <Text text="x" />;')).error?.message).toBe('`Node` is not an element here: your variable named Node shadows it');
  });

  it('seeds Math.random and fixes Date.now', async () => {
    const source = 'export default () => <Text text={[Math.random(), Math.random(), Date.now()].join(" ")} />;';
    const first = await run(source);
    const second = await run(source);
    const text = (first.frames![0].root.props.text as string).split(' ');
    expect(text[2]).toBe('0');
    expect(text[0]).not.toBe(text[1]);
    expect(second.frames![0].root.props.text).toBe(first.frames![0].root.props.text);
  });

  it('reports what the probe checks', async () => {
    expect(await runFigureWorker(WORKER_SOURCE, { kind: 'probe' })).toEqual({ require: 'undefined', process: 'undefined', importWorks: true, fetchBlocked: true });
  });

  it('compiles inside the worker, so a slow parse is cut by the deadline', async () => {
    const source = `export default () => a${'?.b'.repeat(64 * 1024 / 3)};`.slice(0, 64 * 1024);
    await expect(runFigureWorker(WORKER_SOURCE, { kind: 'run', source }, 2000)).rejects.toThrow('Script execution timed out');
  });

  it('sends props without __self, __source or key', async () => {
    const props = (await run('export default () => <Row gap="sm">{[1].map(i => <Node key={i} label="x" />)}</Row>;')).frames![0].root;
    expect(Object.keys(props.props)).toEqual(['gap']);
    expect(Object.keys((props.children[0] as { props: object }).props)).toEqual(['label']);
  });
});
