import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildSync } from 'esbuild';

import type { FigureData } from '@/renderer/figure/FigureData';
import { validateFigure } from '@/renderer/figure/validateFigure';
import { messageOf } from '@/shared/messageOf';
import { buildFigureWorker } from '../../scripts/buildFigureWorker.js';

const worker = buildFigureWorker();
/** A program taking longer than this is stuck; the worker's own deadline is 2 s per script. */
const DEADLINE_MS = 10_000;

/** The child's script: the figure worker in `node:vm` on the request read from stdin, its first message written to stdout. */
const child = buildSync({
  stdin: {
    contents: `import { runFigureWorker } from './tests/runFigureWorker';
let input = '';
process.stdin.setEncoding('utf8').on('data', (chunk) => { input += chunk; }).on('end', () => {
  const { worker, request } = JSON.parse(input);
  runFigureWorker(worker, request).then(
    (message) => process.stdout.write(JSON.stringify({ message })),
    (error) => process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })),
  );
});`,
    resolveDir: path.resolve(__dirname, '../..'),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
}).outputFiles[0].text;

/**
 * Runs one request in the figure worker in a child process. `node:vm` is no sandbox, and a reply in `fixtures/generated`
 * is a program a model wrote, so the child gets no environment and Node's permission model: it cannot read or write
 * files or start processes. It can still reach the network, which Node 22 does not restrict.
 */
function isolated(request: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['--permission', '-e', child], { env: {}, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => proc.kill('SIGKILL'), DEADLINE_MS);
    proc.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk; });
    proc.stderr.setEncoding('utf8').on('data', (chunk: string) => { err += chunk; });
    proc.on('error', reject);
    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal) return reject(new Error(`no answer within ${DEADLINE_MS / 1000} s`));
      try {
        const answer = JSON.parse(out) as { message?: unknown; error?: string };
        if (answer.error !== undefined) reject(new Error(answer.error));
        else resolve(answer.message);
      } catch {
        reject(new Error(`the runner exited ${code}: ${err.trim().split('\n').at(-1) ?? 'no output'}`));
      }
    });
    proc.stdin.end(JSON.stringify({ worker, request }));
  });
}

/** Runs a figure program in the figure worker and validates what it returns: the figure, or why it cannot be drawn. */
export async function runFigure(source: string): Promise<{ figure: FigureData } | { error: string }> {
  let raw: unknown;
  try {
    raw = await isolated({ kind: 'run', source, params: {} });
  } catch (error) {
    return { error: `does not run: ${messageOf(error)}` };
  }
  const thrown = (raw as { error?: { message: string } } | undefined)?.error;
  if (thrown) return { error: `throws: ${thrown.message}` };
  const result = validateFigure(raw);
  return result.ok ? { figure: result.figure } : { error: `invalid: ${result.error}` };
}

/** The error a figure program fails with, or undefined when it can be drawn. */
export async function figureError(source: string): Promise<string | undefined> {
  const result = await runFigure(source);
  return 'error' in result ? result.error : undefined;
}
