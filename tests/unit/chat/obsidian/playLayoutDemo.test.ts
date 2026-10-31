import { LAYOUT_DEMO_TURNS } from '@/chat/obsidian/playLayoutDemo';
import { countFigures, splitReply } from '@/chat/splitReply';
import { LIMITS } from '@/renderer/figure/FigureData';
import { WORKER_SOURCE } from '@/renderer/figure/sandboxSource';
import { validateFigure } from '@/renderer/figure/validateFigure';

import { runFigureWorker } from '../../../runFigureWorker';

jest.mock('obsidian', () => ({ Notice: jest.fn() }), { virtual: true });

const figures = LAYOUT_DEMO_TURNS.flatMap((turn) => splitReply(turn.reply, true).filter((segment) => segment.kind === 'figure').map((segment) => segment.text));

describe('the figure layout demo', () => {
  it('keeps each reply within the figures a reply draws', () => {
    for (const turn of LAYOUT_DEMO_TURNS) expect(countFigures(turn.reply)).toBeLessThanOrEqual(LIMITS.figuresPerReply);
  });

  it('covers a listed figure and a long one with headings, captioned and bare single steps, a wide one and an overflowing one', async () => {
    const shapes = await Promise.all(figures.map(async (source) => {
      const result = validateFigure(await runFigureWorker(WORKER_SOURCE, { kind: 'run', source, params: {} }));
      if (!result.ok) throw new Error(result.error);
      return [result.figure.steps.length, result.figure.steps[0].root.type, Boolean(result.figure.steps[0].caption), Boolean(result.figure.steps[0].heading)];
    }));
    expect(shapes).toEqual([[4, 'Diagram', true, true], [8, 'Seq', true, true], [1, 'Diagram', true, false], [1, 'Diagram', false, false], [3, 'Plot', true, false], [3, 'Table', true, false]]);
  });
});
