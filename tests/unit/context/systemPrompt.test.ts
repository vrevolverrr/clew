import { splitReply } from '@/chat/splitReply';
import { buildSystemPrompt } from '@/context/systemPrompt';
import { ELEMENT_PROPS } from '@/renderer/figure/FigureData';
import { WORKER_SOURCE } from '@/renderer/figure/sandboxSource';
import { validateFigure } from '@/renderer/figure/validateFigure';

import { runFigureWorker } from '../../runFigureWorker';

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt();

  it('names every figure element and every prop it takes', () => {
    for (const [element, props] of Object.entries(ELEMENT_PROPS)) {
      expect(prompt).toContain(`<${element}`);
      for (const prop of props) expect(prompt).toContain(prop);
    }
    console.log(`System prompt: ${prompt.length} characters`);
  });

  it('carries nothing of OpenUI or its tool', () => {
    expect(prompt.toLowerCase()).not.toContain('openui');
    expect(prompt).not.toContain('load_pack');
  });

  it('gives an example figure that runs and validates', async () => {
    const example = splitReply(prompt, true).filter((segment) => segment.kind === 'figure').at(-1)!;
    const result = validateFigure(await runFigureWorker(WORKER_SOURCE, { kind: 'run', source: example.text, params: {} }));
    expect(result.ok ? 'ok' : result.error).toBe('ok');
  });
});
