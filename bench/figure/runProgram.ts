import type { FigureData } from '@/renderer/figure/FigureData';
import { validateFigure } from '@/renderer/figure/validateFigure';
import { messageOf } from '@/shared/messageOf';
import { buildFigureWorker } from '../../scripts/buildFigureWorker.js';
import { runFigureWorker } from '../../tests/runFigureWorker';

const worker = buildFigureWorker();

/** Runs a figure program in the figure worker and validates what it returns: the figure, or why it cannot be drawn. */
export async function runFigure(source: string): Promise<{ figure: FigureData } | { error: string }> {
  let raw: unknown;
  try {
    raw = await runFigureWorker(worker, { kind: 'run', source, params: {} });
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
