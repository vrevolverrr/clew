import { VISUALS_DEMO_TURNS } from '@/chat/obsidian/playVisualsDemo';
import { countFigures, splitReply } from '@/chat/splitReply';
import { LIMITS } from '@/renderer/figure/FigureData';
import { WORKER_SOURCE } from '@/renderer/figure/sandboxSource';
import { validateFigure } from '@/renderer/figure/validateFigure';

import { runFigureWorker } from '../../../runFigureWorker';

jest.mock('obsidian', () => ({ Notice: jest.fn() }), { virtual: true });

const figures = VISUALS_DEMO_TURNS.flatMap((turn) => splitReply(turn.reply, true).filter((segment) => segment.kind === 'figure').map((segment) => segment.text));

describe('the visuals demo', () => {
  it('keeps each reply within the figures a reply draws, with one Mermaid fence', () => {
    for (const turn of VISUALS_DEMO_TURNS) expect(countFigures(turn.reply)).toBeLessThanOrEqual(LIMITS.figuresPerReply);
    expect(figures).toHaveLength(6);
    expect(VISUALS_DEMO_TURNS.flatMap((turn) => splitReply(turn.reply, true)).filter((segment) => segment.kind === 'mermaid')).toHaveLength(1);
  });

  it.each(figures.map((source, i) => [i + 1, source]))('runs figure %i, and what it returns validates', async (_, source) => {
    const reply = await runFigureWorker(WORKER_SOURCE, { kind: 'run', source, params: {} });
    const result = validateFigure(reply);
    expect(result.ok ? 'ok' : result.error).toBe('ok');
  });
});
