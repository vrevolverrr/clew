// Bench A: draws figure and Mermaid fixtures in a real Obsidian window and checks the layout of every state.
// Reports to promptfoo (`npx promptfoo view`) and to out/<time>/contact.html.
// npm run bench:figures -- [--only=text] [--source=stress,demo,generated] [--widths=320,480,720] [--themes=light,dark] [--update] [--keep]
// Needs Obsidian running with its CLI on. Opens a throwaway vault in a second window and removes it afterwards.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { type ApiProvider, type Assertion, evaluate } from 'promptfoo';

import { splitReply } from '@/chat/splitReply';
import { setup, teardown } from './benchVault';
import { CASES } from './cases';
import { check, compare, type Finding, heightJumps, snapshot, type Snapshot } from './checks';
import type { StateGeometry, VisualInfo } from './geometry';
import { cdp, evalIn, evalJson } from './obsidianCli';
import { checkPlots3 } from './scene3Checks';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const GOLDEN = path.join(HERE, 'golden');
const STRESS = path.join(HERE, 'fixtures', 'stress');
const GENERATED = path.join(HERE, 'fixtures', 'generated');
const MAX_STEPS = 6;

const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    source: { type: 'string', default: 'stress,demo,generated' },
    widths: { type: 'string', default: '320,480,720' },
    themes: { type: 'string', default: 'light,dark' },
    update: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
  },
});
const widths = args.widths.split(',').map(Number);
const themes = args.themes.split(',');
const sources = new Set(args.source.split(','));

interface Fixture { id: string; source: 'stress' | 'demo' | 'generated'; reply: string; caseId?: string }

const fence = (kind: string, text: string) => `\`\`\`${kind}\n${text}\n\`\`\``;

async function demoFixtures(): Promise<Fixture[]> {
  // The demo modules import `obsidian` for their notices; a stub stands in, since only the scripted replies are read.
  const stub = path.join(HERE, 'obsidianStub.ts');
  const out = await build({
    stdin: { contents: "export { VISUALS_DEMO_TURNS } from '@/chat/obsidian/playVisualsDemo'; export { LAYOUT_DEMO_TURNS } from '@/chat/obsidian/playLayoutDemo';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'node', alias: { obsidian: stub }, tsconfig: 'tsconfig.json',
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`) as Record<string, { reply: string }[]>;
  return Object.entries({ visuals: mod.VISUALS_DEMO_TURNS, layout: mod.LAYOUT_DEMO_TURNS }).flatMap(([name, turns]) => turns.flatMap((turn, t) => splitReply(turn.reply, true)
    .filter((segment) => segment.kind !== 'prose')
    .map((segment, n) => ({ id: `demo-${name}-${t + 1}-${n + 1}`, source: 'demo' as const, reply: fence(segment.kind, segment.text) }))));
}

async function stressFixtures(): Promise<Fixture[]> {
  const files = (await readdir(STRESS)).filter((name) => name.endsWith('.jsx')).sort();
  return Promise.all(files.map(async (file): Promise<Fixture> => ({ id: `stress-${file.slice(0, -4)}`, source: 'stress', reply: fence('figure', (await readFile(path.join(STRESS, file), 'utf8')).trimEnd()) })));
}

async function generatedFixtures(): Promise<Fixture[]> {
  if (!existsSync(GENERATED)) return [];
  const fixtures: Fixture[] = [];
  for (const model of (await readdir(GENERATED, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map(({ name }) => name)) {
    for (const file of (await readdir(path.join(GENERATED, model))).filter((name) => name.endsWith('.md'))) {
      const reply = await readFile(path.join(GENERATED, model, file), 'utf8');
      if (/```(figure|mermaid)/.test(reply)) fixtures.push({ id: `${model}/${file.slice(0, -3)}`, source: 'generated', reply, caseId: file.slice(0, -3) });
    }
  }
  return fixtures;
}

async function pageScript(): Promise<string> {
  const out = await build({ entryPoints: [path.join(HERE, 'page.ts')], bundle: true, write: false, format: 'iife', globalName: '__clewBench', target: 'chrome120' });
  return `${out.outputFiles[0].text}; window.__clewBench = __clewBench; "ok"`;
}

/** Which states to measure: the steps (first, last and a few between), then each slider at both ends and back. */
function statesOf(visual: VisualInfo): string[] {
  const n = visual.steps;
  const picked = n <= MAX_STEPS ? [...Array(n).keys()] : [...new Set(Array.from({ length: MAX_STEPS }, (_, i) => Math.round(i * (n - 1) / (MAX_STEPS - 1))))];
  const params = visual.params.flatMap((param, i) => [`param:${i}:${param.min}`, `param:${i}:${param.max}`, `param:${i}:${param.value}`]);
  return [...picked.map((step) => `step:${step}`), ...params];
}

interface Row { fixture: string; source: string; visual: number; kind: string; theme: string; width: number; state: string; findings: Finding[]; shot?: string; golden?: string[] }

const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(HERE, 'out', stamp);

async function main(): Promise<void> {
  const fixtures = [
    ...(sources.has('stress') ? await stressFixtures() : []),
    ...(sources.has('demo') ? await demoFixtures() : []),
    ...(sources.has('generated') ? await generatedFixtures() : []),
  ].filter(({ id }) => !args.only || id.includes(args.only));
  if (!fixtures.length) throw new Error('No fixtures match');
  await mkdir(path.join(outDir, 'shots'), { recursive: true });

  const rows: Row[] = [];
  // 3D Plots are checked from their geometry first, with no window; the most faces any of a fixture's Plots draws decides
  // whether its canvas may be blank.
  const faces3 = new Map<string, number>();
  for (const fixture of fixtures) {
    for (const { text } of splitReply(fixture.reply, true).filter(({ kind }) => kind === 'figure')) {
      const report = await checkPlots3(text);
      if (!report) continue;
      faces3.set(fixture.id, Math.max(faces3.get(fixture.id) ?? 0, report.faces));
      rows.push({ fixture: fixture.id, source: fixture.source, visual: 0, kind: 'figure', theme: '-', width: 0, state: 'scene3', findings: report.findings });
    }
  }
  if (faces3.size) process.stdout.write(`Checked the 3D geometry of ${faces3.size} fixtures\n`);

  const vault = await setup();
  const started = Date.now();
  try {
    await evalIn(vault, await pageScript());
    await cdp(vault, 'Emulation.setDeviceMetricsOverride', { width: 1400, height: 3000, deviceScaleFactor: 2, mobile: false });
    await cdp(vault, 'Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await evalIn(vault, 'app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); "ok"');

    for (const [f, fixture] of fixtures.entries()) {
      process.stdout.write(`[${f + 1}/${fixtures.length}] ${fixture.id}`);
      // Generated replies change with every eval run, so only stress and demo fixtures keep goldens.
      const goldenFile = fixture.source === 'generated' ? null : path.join(GOLDEN, fixture.source, `${fixture.id.slice(fixture.source.length + 1)}.json`);
      const goldens: Record<string, Snapshot> = goldenFile && existsSync(goldenFile) ? JSON.parse(await readFile(goldenFile, 'utf8')) : {};
      let goldensChanged = false;
      try {
        await cdp(vault, 'Page.bringToFront', {}).catch(() => undefined);
        const visuals = await evalJson<VisualInfo[]>(vault, `__clewBench.play(${JSON.stringify(fixture.reply)})`);
        if (!visuals.length) rows.push({ fixture: fixture.id, source: fixture.source, visual: -1, kind: '-', theme: '-', width: 0, state: '-', findings: [{ check: 'no-visual', detail: 'the reply drew no figure or diagram' }] });
        for (const theme of themes) {
          await evalJson(vault, `__clewBench.theme(${theme === 'dark'})`);
          for (const [v, visual] of visuals.entries()) {
            for (const width of widths) {
              const states = statesOf(visual);
              const measured: StateGeometry[] = [];
              for (const [s, state] of states.entries()) {
                let geometry: StateGeometry;
                try {
                  geometry = await evalJson<StateGeometry>(vault, `__clewBench.measure(${v}, ${width}, ${JSON.stringify(state)})`);
                } catch (error) {
                  rows.push({ fixture: fixture.id, source: fixture.source, visual: v, kind: visual.kind, theme, width, state, findings: [{ check: 'harness', detail: error instanceof Error ? error.message.slice(0, 300) : String(error) }] });
                  continue;
                }
                measured.push(geometry);
                const findings = check(geometry);
                if (faces3.has(fixture.id)) {
                  const seen = await evalJson<{ painted: number[]; outside: string[]; live: number; shown: number } | null>(vault, `__clewBench.inspect3(${v})`);
                  if (seen) {
                    seen.painted.forEach((share, i) => { if (share < 0.002 && faces3.get(fixture.id)! > 0) findings.push({ check: 'blank-canvas', detail: `3D Plot ${i + 1} painted ${(share * 100).toFixed(2)}% of its canvas` }); });
                    for (const what of seen.outside.slice(0, 3)) findings.push({ check: 'cut-off', detail: what });
                    if (seen.outside.length > 3) findings.push({ check: 'cut-off', detail: `and ${seen.outside.length - 3} more marks outside the drawing` });
                    if (seen.live > seen.shown) findings.push({ check: 'kept-canvas', detail: `${seen.live} canvases hold a bitmap; the shown step has ${seen.shown}` });
                  }
                }
                const row: Row = { fixture: fixture.id, source: fixture.source, visual: v, kind: visual.kind, theme, width, state, findings };
                const stepStates = states.filter((name) => name.startsWith('step:'));
                if (s === 0 || state === stepStates.at(-1) || (state.startsWith('param:') && !state.endsWith(`:${visual.params[Number(state.split(':')[1])].value}`))) {
                  const { x, y, w, h } = geometry.rect;
                  try {
                    const { data } = await cdp<{ data: string }>(vault, 'Page.captureScreenshot', { format: 'png', clip: { x, y, width: Math.max(1, w), height: Math.max(1, h), scale: 1 }, captureBeyondViewport: true });
                    row.shot = `shots/${fixture.id.replace(/\//g, '__')}-${v}-${theme}-${width}-${state.replace(/:/g, '_')}.png`;
                    await writeFile(path.join(outDir, row.shot), Buffer.from(data, 'base64'));
                  } catch (error) {
                    findings.push({ check: 'harness', detail: `no screenshot: ${error instanceof Error ? error.message : String(error)}` });
                  }
                }
                if (goldenFile) {
                  const key = `${v}|${theme}|${width}|${state}`;
                  const now = snapshot(geometry);
                  if (goldens[key] && !args.update) row.golden = compare(goldens[key], now);
                  else if (!findings.length) { goldens[key] = now; goldensChanged = true; }
                }
                rows.push(row);
              }
              const jumps = heightJumps(measured);
              if (jumps.length) rows.push({ fixture: fixture.id, source: fixture.source, visual: v, kind: visual.kind, theme, width, state: 'steps', findings: jumps });
            }
            // A 3D Plot keeps its angle through steps, slider churn and a resize; it turns within a frame, and at 30 fps on a
            // CPU slowed 4× even at 1200 px. Once per visual, in the first theme.
            if (theme === themes[0] && faces3.has(fixture.id)) {
              await evalJson(vault, `__clewBench.measure(${v}, ${Math.max(...widths)}, "step:0")`);
              const lost = await evalJson<string[]>(vault, `__clewBench.angleKept(${v})`);
              if (lost.length) rows.push({ fixture: fixture.id, source: fixture.source, visual: v, kind: visual.kind, theme, width: Math.max(...widths), state: 'angle', findings: lost.map((detail) => ({ check: 'angle-lost', detail })) });
              await evalIn(vault, `require('@electron/remote').getCurrentWindow().show(), require('@electron/remote').getCurrentWindow().focus(), 'ok'`);
              for (const [width, rate, limit] of [[720, 1, 20], [720, 4, 34], [1200, 4, 34]] as const) {
                await evalJson(vault, `__clewBench.measure(${v}, ${width}, "step:0")`);
                await cdp(vault, 'Emulation.setCPUThrottlingRate', { rate });
                try {
                  const turn = await evalJson<{ frames: number; dropped: number; p95: number; median: number } | null>(vault, `__clewBench.turnTimes(${v})`);
                  if (!turn) continue;
                  // A frame this slow at full speed would block the window for many seconds once the CPU is slowed.
                  if (rate === 1 && turn.median > 100) {
                    rows.push({ fixture: fixture.id, source: fixture.source, visual: v, kind: visual.kind, theme, width, state: 'turn-1x', findings: [{ check: 'slow-turn', detail: `median frame ${turn.median.toFixed(0)} ms at ${width}px; the slowed runs were skipped` }] });
                    break;
                  }
                  process.stdout.write(`  turn ${width}px ${rate}x: median ${turn.median.toFixed(1)} p95 ${turn.p95.toFixed(1)} ms, ${(turn.dropped * 100).toFixed(0)}% dropped;`);
                  rows.push({ fixture: fixture.id, source: fixture.source, visual: v, kind: visual.kind, theme, width, state: `turn-${rate}x`, findings: turn.p95 > limit ? [{ check: rate === 1 ? 'slow-turn' : 'slow-turn-4x', detail: `p95 frame ${turn.p95.toFixed(1)} ms (median ${turn.median.toFixed(1)}) at ${width}px, CPU ${rate}×` }] : [] });
                } catch (error) {
                  rows.push({ fixture: fixture.id, source: fixture.source, visual: v, kind: visual.kind, theme, width, state: `turn-${rate}x`, findings: [{ check: 'harness', detail: error instanceof Error ? error.message.slice(0, 300) : String(error) }] });
                } finally {
                  await cdp(vault, 'Emulation.setCPUThrottlingRate', { rate: 1 });
                }
              }
            }
          }
        }
      } catch (error) {
        rows.push({ fixture: fixture.id, source: fixture.source, visual: -1, kind: '-', theme: '-', width: 0, state: '-', findings: [{ check: 'harness', detail: error instanceof Error ? error.message : String(error) }] });
      }
      if (goldenFile && goldensChanged) {
        await mkdir(path.dirname(goldenFile), { recursive: true });
        await writeFile(goldenFile, `${JSON.stringify(goldens)}\n`);
      }
      const mine = rows.filter((row) => row.fixture === fixture.id);
      process.stdout.write(`  ${mine.reduce((sum, row) => sum + row.findings.length, 0)} findings\n`);
    }
  } finally {
    await evalJson(vault, '__clewBench.close()').catch(() => undefined);
    if (!args.keep) await teardown();
  }

  const meta = { commit: git('rev-parse', '--short', 'HEAD'), dirty: git('status', '--porcelain').length > 0, seconds: Math.round((Date.now() - started) / 1000), widths, themes, fixtures: fixtures.length };
  await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify({ meta, rows }, null, 1)}\n`);
  await writeFile(path.join(outDir, 'contact.html'), contactSheet(fixtures, rows));
  const clean = await promptfooReport(fixtures, rows, meta);
  process.stdout.write(`\n${clean}. npx promptfoo view shows the run; ${path.relative(process.cwd(), outDir)}/contact.html has every shot\n`);
}

/** A row's promptfoo column: its theme and pane width for a layout state, or `fixture` for the checks made once per fixture. */
const columnOf = (row: Row): string => (/^(step:|param:|steps$)/.test(row.state) ? `${row.theme} ${row.width}px` : 'fixture');

/** Records the run as a promptfoo eval: a test per fixture, a column per theme and width, a metric per check. */
async function promptfooReport(fixtures: Fixture[], rows: Row[], meta: object): Promise<string> {
  // Each line starts with its check, which the assertions match on; TeX labels carry line breaks.
  const lines = (row: Row): string[] => [
    ...row.findings.map(({ check, detail }) => `${check} (#${row.visual} ${row.state}): ${detail.replace(/\s+/g, ' ')}`),
    ...(row.golden ?? []).map((change) => `golden (#${row.visual} ${row.state}): ${change.replace(/\s+/g, ' ')}`),
  ];
  const column = (name: string): ApiProvider => ({
    id: () => `bench:${name}`,
    label: name,
    async callApi(_prompt, context) {
      const mine = rows.filter((row) => row.fixture === context?.vars.fixture && columnOf(row) === name);
      const shots = mine.filter((row) => row.shot);
      const images = await Promise.all(shots.map(async (row) => ({ data: `data:image/png;base64,${(await readFile(path.join(outDir, row.shot!))).toString('base64')}`, mimeType: 'image/png' })));
      const found = mine.flatMap(lines);
      const caption = shots.length ? [`Shots: ${shots.map((row) => `#${row.visual} ${row.state}`).join(', ')}`] : [];
      return { output: [...found, ...caption].join('\n') || (mine.length ? 'No findings' : 'Not measured'), images };
    },
  });
  const checks = [...new Set(rows.flatMap(lines).map((line) => line.slice(0, line.indexOf(' ('))))].sort();
  const assert = checks.map((check): Assertion => ({
    type: 'javascript',
    metric: check,
    value: (output) => {
      const hits = output.split('\n').filter((line) => line.startsWith(`${check} (`));
      return hits.length ? { pass: false, score: 0, reason: hits.join('\n') } : { pass: true, score: 1, reason: check };
    },
  }));
  const used = new Set(rows.map(columnOf));
  const columns = [...themes.flatMap((theme) => widths.map((width) => `${theme} ${width}px`)), 'fixture'].filter((name) => used.has(name));
  const result = await evaluate({
    description: `Figure layout bench: ${args.source}${args.only ? ` (only ${args.only})` : ''}`,
    prompts: ['{{fixture}}'],
    providers: columns.map(column),
    tests: fixtures.map((fixture) => ({ description: fixture.id, vars: { fixture: fixture.id }, metadata: { source: fixture.source }, assert })),
    metadata: meta,
    writeLatestResults: true,
  }, { maxConcurrency: 8, cache: false });
  const { results } = await result.toEvaluateSummary();
  return `${results.filter(({ success }) => success).length}/${results.length} cells clean`;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function contactSheet(fixtures: Fixture[], rows: Row[]): string {
  const sections = fixtures.map((fixture) => {
    const mine = rows.filter((row) => row.fixture === fixture.id);
    const testCase = CASES.find(({ id }) => id === fixture.caseId);
    const findings = [...new Set(mine.flatMap((row) => row.findings.map((f) => `${f.check} (${row.theme} ${row.width}px ${row.state}): ${f.detail}`)))];
    const shots = mine.filter((row) => row.shot).map((row) => `<figure><img loading="lazy" src="${row.shot}"><figcaption>#${row.visual} ${row.theme} ${row.width}px ${row.state}${row.findings.length ? ` <b>${row.findings.length}</b>` : ''}</figcaption></figure>`);
    return `<section id="${escape(fixture.id)}"><h2>${escape(fixture.id)}</h2>${testCase ? `<p><i>${escape(testCase.prompt)}</i></p><p>Must show: ${escape(testCase.mustShow.join('; '))}</p>` : ''}
<details${findings.length ? ' open' : ''}><summary>${findings.length} distinct findings</summary><ul>${findings.slice(0, 40).map((f) => `<li>${escape(f)}</li>`).join('')}</ul></details><div class="shots">${shots.join('')}</div></section>`;
  });
  return `<!doctype html><meta charset="utf-8"><title>Figure bench</title><style>
body { font: 14px system-ui; margin: 16px; background: #f4f4f4; color: #222 } section { background: #fff; margin: 0 0 24px; padding: 12px; border-radius: 8px }
.shots { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start } figure { margin: 0 } img { max-width: 360px; border: 1px solid #ccc; display: block } figcaption { font-size: 12px; color: #666 } b { color: #c00 }
</style>${sections.join('\n')}`;
}

process.on('SIGINT', () => { void teardown().finally(() => process.exit(130)); });
await main();
