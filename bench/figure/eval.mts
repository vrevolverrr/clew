// Bench B: asks each model for every case in cases.ts as a real Clew chat turn, checks which visual it chose and that
// each figure runs, and saves every reply to fixtures/generated/<model>/<case>.md for Bench A to draw.
// npm run eval:figures -- [--only=text] [--repeat=1] [--models=haiku,luna]
import '../../tests/setupWindow';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { type Assertion, evaluate, type TestCase } from 'promptfoo';

import { splitReply } from '@/chat/splitReply';
import { clewProvider, type TurnVars } from '../../eval/ClewProvider';
import { CASES, type FigureCase } from './cases';
import type { FigureNode } from '@/renderer/figure/FigureData';
import { figureError, runFigure } from './runProgram';

// Obsidian is never launched from a Claude Code session; drop that session's markers, as the tutoring eval does.
for (const key of Object.keys(process.env)) {
  if (/^CLAUDE(CODE$|_CODE_ENTRYPOINT$|_CODE_SESSION|_CODE_CHILD|_CODE_MESSAGING|_CODE_BRIDGE|_PID$)/.test(key)) delete process.env[key];
}

const MODELS = { haiku: ['claude', 'haiku'], luna: ['codex', 'gpt-6-luna'] } as const;
const HERE = path.dirname(new URL(import.meta.url).pathname);

const { values: args } = parseArgs({
  options: { only: { type: 'string' }, repeat: { type: 'string', default: '1' }, models: { type: 'string', default: 'haiku,luna' } },
});
const models = args.models.split(',').map((name) => {
  if (!(name in MODELS)) throw new Error(`Unknown model "${name}"; use ${Object.keys(MODELS).join(', ')}.`);
  return name as keyof typeof MODELS;
});

const code = (metric: string, check: (output: string) => true | string | Promise<true | string>): Assertion => ({
  type: 'javascript',
  metric,
  value: async (output) => {
    const result = await check(output);
    return result === true ? { pass: true, score: 1, reason: metric } : { pass: false, score: 0, reason: result };
  },
});

const kinds = (output: string) => splitReply(output, true).map(({ kind }) => kind);

const chose = (expect: FigureCase['expect']) => code('choice', (output) => {
  const found = kinds(output);
  const figure = found.includes('figure');
  const mermaid = found.includes('mermaid');
  if (expect === 'figure') return figure || (mermaid ? 'drew Mermaid where a figure was expected' : 'no visual');
  if (expect === 'mermaid') return mermaid || (figure ? 'drew a figure where Mermaid fits' : 'no visual');
  if (expect === 'visual') return figure || mermaid || 'no visual';
  return !figure || 'drew a figure where the contract says to explain in prose';
});

const runs = code('runs', async (output) => {
  for (const [i, { text }] of splitReply(output, true).filter(({ kind }) => kind === 'figure').entries()) {
    const error = await figureError(text);
    if (error) return `figure ${i + 1} ${error}`;
  }
  return true;
});

/** Every 3D Plot the reply's figures draw, in any step. */
async function plots3(output: string): Promise<Extract<FigureNode, { type: 'Plot3' }>[]> {
  const found: Extract<FigureNode, { type: 'Plot3' }>[] = [];
  const walk = (node: FigureNode): void => {
    if (node.type === 'Plot3') found.push(node);
    if (node.type === 'Row' || node.type === 'Column' || node.type === 'Panel') node.children.forEach(walk);
  };
  for (const { text } of splitReply(output, true).filter(({ kind }) => kind === 'figure')) {
    const result = await runFigure(text);
    if ('figure' in result) result.figure.steps.forEach((step) => walk(step.root));
  }
  return found;
}

/** A 3D case draws a 3D Plot with its kind of surface, and its points on the surface; any other case stays 2D. */
const dimensions = (testCase: FigureCase) => code('plot3', async (output) => {
  const plots = await plots3(output);
  if (!testCase.plot3) return !plots.length || 'drew a 3D Plot where the case is 2D';
  if (!plots.length) return 'drew no 3D Plot';
  const kind = testCase.plot3 === 'graph' ? 'zs' : 'pts';
  if (!plots.some((plot) => plot.children.some((layer) => layer.type === 'Fn' && kind in layer))) return `drew no ${testCase.plot3} surface`;
  const f = testCase.onSurface;
  if (f) {
    for (const plot of plots) for (const layer of plot.children) {
      if (layer.type !== 'Points' && layer.type !== 'Shape') continue;
      const off = layer.pts.find(([x, y, z]) => Math.abs(z - f(x, y)) > 1e-6 * Math.max(1, Math.abs(f(x, y))));
      if (off) return `${layer.type}${layer.id ? ` ${layer.id}` : ''} has [${off.join(', ')}] off the surface`;
    }
  }
  return true;
});

const tests: TestCase[] = CASES.filter(({ id }) => !args.only || id.includes(args.only)).map((testCase) => ({
  description: testCase.id,
  vars: { chat: { conversation: testCase.id, notes: {}, messages: [testCase.prompt], turn: 1 } satisfies TurnVars },
  metadata: { domain: testCase.domain, tier: testCase.tier },
  assert: [chose(testCase.expect), runs, dimensions(testCase)],
}));

const providers = models.map((name) => clewProvider(MODELS[name][0], MODELS[name][1]));
const label = (id: string) => models.find((name) => id.endsWith(`:${MODELS[name][1]}`)) ?? id.replace(/[^a-z0-9-]/gi, '_');
const print = (line: string): void => { process.stdout.write(`${line}\n`); };

try {
  const result = await evaluate({
    description: `Figure eval: ${models.join(', ')}${args.only ? ` (only ${args.only})` : ''}`,
    prompts: ['{{ chat.messages[chat.turn - 1] }}'],
    providers,
    tests,
    writeLatestResults: true,
  }, { maxConcurrency: 4, repeat: Number(args.repeat), cache: false });
  const { results } = await result.toEvaluateSummary();
  for (const row of results) {
    const model = label(row.provider.id ?? '');
    const id = row.testCase.description ?? 'case';
    const output = typeof row.response?.output === 'string' ? row.response.output : '';
    const dir = path.join(HERE, 'fixtures', 'generated', model);
    await mkdir(dir, { recursive: true });
    // shortcut: with --repeat above 1 the last repeat's reply wins; key the file by repeat when Bench A should draw them all.
    await writeFile(path.join(dir, `${id}.md`), output);
    const failed = row.gradingResult?.componentResults?.filter(({ pass }) => !pass).map(({ assertion, reason }) => `${assertion?.metric}: ${reason}`) ?? [];
    print(`${row.success ? 'PASS' : 'FAIL'}  ${model}  ${id}${row.error ? `  error: ${row.error}` : ''}`);
    for (const reason of failed) print(`      ${reason}`);
  }
  print(`\n${results.filter(({ success }) => success).length}/${results.length} passed. npx promptfoo view opens the replies.`);
} finally {
  for (const provider of providers) await provider.cleanup?.();
}
