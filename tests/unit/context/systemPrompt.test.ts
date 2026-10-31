import { splitReply } from '@/chat/splitReply';
import { buildSystemPrompt } from '@/context/systemPrompt';
import { ELEMENT_PROPS } from '@/renderer/figure/FigureData';
import { WORKER_SOURCE } from '@/renderer/figure/sandboxSource';
import { validateFigure } from '@/renderer/figure/validateFigure';

import { runFigureWorker } from '../../runFigureWorker';

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt();

  // The prompt states `id` once in prose rather than in each signature, and leaves these props out of their element's signature.
  const UNLISTED: Readonly<Record<string, readonly string[]>> = { Fn: ['pts'], Label: ['tag'], RightAngle: ['tag'], Dimension: ['tag'] };

  it.each(Object.entries(ELEMENT_PROPS))('writes <%s> with every prop it takes in its own signature', (element, props) => {
    const signatures = [...prompt.matchAll(new RegExp(`\`<${element}(?=[\\s/>])[^\`]*\``, 'g'))].map((match) => match[0]);
    const listed = props.filter((prop) => prop !== 'id' && !UNLISTED[element]?.includes(prop));

    const missing = listed.filter((prop) => !signatures.some((signature) => new RegExp(`[\\s{(,]${prop}(?=[\\s=/>,}])`).test(signature)));

    expect(signatures.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('gives an example figure that runs and validates', async () => {
    const example = splitReply(prompt, true).filter((segment) => segment.kind === 'figure').at(-1)!;
    const result = validateFigure(await runFigureWorker(WORKER_SOURCE, { kind: 'run', source: example.text, params: {} }));
    expect(result.ok ? 'ok' : result.error).toBe('ok');
  });
});
