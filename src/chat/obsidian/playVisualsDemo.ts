import { type App, Notice } from 'obsidian';

import { type DemoChat, scriptedSession } from '@/chat/obsidian/playHighlightDemo';

const fence = (program: string): string => ['```figure', program, '```'].join('\n');

const TAYLOR = String.raw`export const params = { n: { label: 'Terms in the series', min: 1, max: 8, step: 1, value: 3 } };

export default function ({ n }) {
  const fact = k => (k <= 1 ? 1 : k * fact(k - 1));
  const taylor = x => {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += (-1) ** j * x ** (2 * j + 1) / fact(2 * j + 1);
    return sum;
  };
  const error = Math.abs(Math.sin(3) - taylor(3));
  return (
    <Column gap="sm">
      <Plot id="p" x={[-7, 7]} y={[-3, 3]} xLabel="x">
        <Fn id="sin" f={Math.sin} label="sin x" />
        <Fn id="t" f={taylor} label={'Taylor polynomial of degree ' + (2 * n - 1)} />
      </Plot>
      <Row gap="sm">
        <Node id="deg" label={2 * n - 1} sub="degree" />
        <Node id="err" label={error.toFixed(4)} sub="error at x = 3" tag={error < 0.01 ? 'good' : 'bad'} />
      </Row>
    </Column>
  );
}`;

const QUIZ = String.raw`export default () => (
  <Quiz question="What is the derivative of $\sin x$?" options={['$\\cos x$', '$-\\cos x$', '$\\sin x$']} correct={'$\\cos x$'}
    explanation="The slope of $\sin x$ at each $x$ is $\cos x$." />
);`;

const DIJKSTRA = String.raw`const nodes = ['A', 'B', 'C', 'D', 'E'];
const edges = [['A', 'B', 2], ['A', 'C', 3], ['B', 'D', 3], ['C', 'D', 4], ['D', 'E', 1]];

export default function () {
  const d = Object.fromEntries(nodes.map(n => [n, n === 'A' ? 0 : Infinity]));
  const done = [];
  const show = v => (v === Infinity ? '∞' : v);
  const steps = [{ d: { ...d }, done: [], text: 'Start: **A** is 0 away, every other node ∞.' }];
  while (done.length < nodes.length) {
    const u = nodes.filter(n => !done.includes(n)).sort((a, b) => d[a] - d[b])[0];
    done.push(u);
    const changed = [];
    for (const [a, b, w] of edges) for (const [x, y] of [[a, b], [b, a]]) {
      if (x === u && !done.includes(y) && d[u] + w < d[y]) { d[y] = d[u] + w; changed.push(y + ' → ' + d[y]); }
    }
    steps.push({ d: { ...d }, done: [...done], u, text: 'Settle **' + u + '** at ' + show(d[u]) + '. ' + (changed.length ? 'Relaxed: ' + changed.join(', ') + '.' : 'No distance improves.') });
  }
  const tagOf = (step, n) => (n === step.u ? 'active' : step.done.includes(n) ? 'done' : null);
  return <Figure steps={steps} caption={step => step.text} render={step => (
    <Row gap="lg" align="center">
      <Graph id="g" nodes={nodes.map(n => ({ id: 'g-' + n, label: n }))} edges={edges.map(([a, b, w], i) => ({ id: 'e' + i, from: 'g-' + a, to: 'g-' + b, label: w }))}
        tags={Object.fromEntries(nodes.map(n => ['g-' + n, tagOf(step, n)]))} />
      <Table id="dist" title="Distance" columns={['Node', 'Distance']} rows={nodes.map(n => [n, show(step.d[n])])} rowIds={nodes.map(n => 't-' + n)}
        tags={Object.fromEntries(nodes.map(n => ['t-' + n, tagOf(step, n)]))} />
    </Row>
  )} />;
}`;

const INCLINE = String.raw`export const params = { angle: { label: 'Incline angle', min: 10, max: 60, step: 5, value: 30, unit: '°' } };

export default function ({ angle }) {
  const t = angle * Math.PI / 180, L = 6, m = 2, g = 9.8;
  const A = [0, 0], B = [L * Math.cos(t), 0], C = [L * Math.cos(t), L * Math.sin(t)];
  const P = along(A, C, 0.55);
  const W = m * g, N = W * Math.cos(t), F = W * Math.sin(t);
  const scale = 0.12;
  const tip = (v, k) => [P[0] + v[0] * k * scale, P[1] + v[1] * k * scale];
  return (
    <Row gap="md" align="center">
      <Diagram id="d" width={6} height={5.5}>
        <Shape pts={[A, B, C]} closed />
        <Angle at={A} from={B} to={C} label={'$' + angle + '^\\circ$'} />
        <RightAngle at={B} from={A} to={C} />
        <Vector from={P} to={tip([0, -1], W)} label="$mg$" />
        <Vector from={P} to={tip([-Math.sin(t), Math.cos(t)], N)} label="$N$" tag="good" />
        <Vector from={P} to={tip([-Math.cos(t), -Math.sin(t)], F)} label="$mg\sin\theta$" tag="active" />
        <Dimension from={A} to={B} label={(L * Math.cos(t)).toFixed(2) + ' m'} />
      </Diagram>
      <Column gap="sm">
        <Node id="n" label={N.toFixed(1) + ' N'} sub="normal force" />
        <Node id="f" label={F.toFixed(1) + ' N'} sub="force down the slope" tag="active" />
      </Column>
    </Row>
  );
}`;

const ELIMINATION = String.raw`export default function () {
  let M = [[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]];
  const copy = m => m.map(r => r.slice());
  const steps = [{ M: copy(M), text: 'The augmented matrix of three equations in $x$, $y$, $z$.' }];
  const eliminate = (t, s, col) => {
    const f = M[t][col] / M[s][col];
    M = M.map((r, i) => (i === t ? r.map((v, j) => v - f * M[s][j]) : r));
    const k = Math.abs(Number(f.toFixed(2)));
    const op = '$R_' + (t + 1) + (f > 0 ? ' - ' : ' + ') + (k === 1 ? '' : k) + 'R_' + (s + 1) + '$';
    steps.push({ M: copy(M), row: t, name: op, text: 'Clear the entry below the pivot in column ' + (col + 1) + ': replace row ' + (t + 1) + ' by ' + op + '.' });
  };
  eliminate(1, 0, 0);
  eliminate(2, 0, 0);
  eliminate(2, 1, 1);
  const fmt = v => String(Number(v.toFixed(2)));
  const tex = step => '\\left[\\begin{array}{ccc|c}' + step.M.map((r, i) => (i === step.row ? '\\rowcolor{new} ' : '') + r.map((v, j) => (i === step.row && j === 0 ? '\\cssId{pivot}{' + fmt(v) + '}' : fmt(v))).join(' & ')).join(' \\\\ ') + '\\end{array}\\right]';
  return <Figure steps={steps} caption={step => step.text} render={step => (
    <Column gap="sm">
      <Tex id="m" tex={tex(step)} />
      {step.row !== undefined && <Pointer to="pivot" name={step.name} />}
    </Column>
  )} />;
}`;

const EDIT_DISTANCE = String.raw`const a = 'kitten', b = 'sitting';

export default function () {
  const D = [];
  for (let i = 0; i <= a.length; i++) {
    D.push([]);
    for (let j = 0; j <= b.length; j++) {
      D[i].push(i === 0 ? j : j === 0 ? i : Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
  }
  const steps = D.map((_, i) => ({ i, text: i === 0 ? 'Row 0: turning nothing into each prefix of **' + b + '** costs one insert per letter.' : 'Row ' + i + ': the prefixes of **' + a + '** up to **' + a[i - 1] + '**.' }));
  steps.push({ i: a.length, done: true, text: 'The bottom-right cell is the edit distance: **' + D[a.length][b.length] + '**.' });
  const last = 'r' + a.length + '.' + (b.length + 1);
  return <Figure steps={steps} caption={step => step.text} render={step => (
    <Table id="dp" columns={['', 'ε'].concat(b.split(''))} rowIds={D.map((_, i) => 'r' + i)}
      rows={D.map((row, i) => [i === 0 ? 'ε' : a[i - 1]].concat(row.map(v => (i <= step.i ? v : null))))}
      tags={step.done ? { [last]: 'good' } : { ['r' + step.i]: 'active' }} />
  )} />;
}`;

/** What an agent would write, in two turns: a reply draws at most four figures. */
export const VISUALS_DEMO_TURNS: readonly { message: string; reply: string }[] = [
  {
    message: 'Show me a plot, a quiz and a graph.',
    reply: [
      'Move the slider: the program runs again and redraws the plot and both cards.',
      fence(TAYLOR),
      'A quick check:',
      fence(QUIZ),
      'Dijkstra on a small graph, step by step, with its distance table:',
      fence(DIJKSTRA),
      'A static diagram is Mermaid, not a figure:',
      ['```mermaid', 'flowchart LR', '  Q[Question] --> M{Model} --> A[Answer]', '```'].join('\n'),
    ].join('\n\n'),
  },
  {
    message: 'Show me geometry, a matrix and a table.',
    reply: [
      'A block on an incline. Change the angle and the forces follow:',
      fence(INCLINE),
      'Gaussian elimination, with the changed row coloured and its pivot pointed at:',
      fence(ELIMINATION),
      'Edit distance as a table that fills row by row:',
      fence(EDIT_DISTANCE),
      'That is every kind of figure. Try them in a light and a dark theme.',
    ].join('\n\n'),
  },
];

/** Plays scripted replies in a new chat, so figures can be tried in the vault's theme without a model. */
export async function playVisualsDemo(app: App, openChat: () => Promise<DemoChat | null>): Promise<void> {
  const chat = await openChat();
  if (!chat) return;
  new Notice('Visuals demo: move each control and step through each figure, then switch between a light and a dark theme.');
  const path = app.workspace.getActiveFile()?.path ?? '';
  for (const turn of VISUALS_DEMO_TURNS) await chat.playTurn(turn.message, scriptedSession(turn.reply), path);
}
