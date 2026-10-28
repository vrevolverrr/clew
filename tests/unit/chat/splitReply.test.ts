import { splitReply } from '@/chat/splitReply';

const reply = [
  'The slope is wrong.',
  '```openui-lang',
  'root = Stack([t])',
  't = TextContent("Inner function")',
  '```',
  'Which factor is missing?',
].join('\n');

describe('splitReply', () => {
  it('splits prose and openui fences in order', () => {
    expect(splitReply(reply, true)).toEqual([
      { kind: 'prose', text: 'The slope is wrong.' },
      { kind: 'openui', text: 'root = Stack([t])\nt = TextContent("Inner function")', closed: true },
      { kind: 'prose', text: 'Which factor is missing?' },
    ]);
  });

  it('never shows fence syntax as prose at any chunk boundary', () => {
    for (let end = 1; end <= reply.length; end += 1) {
      const prose = splitReply(reply.slice(0, end), false).filter((s) => s.kind === 'prose');
      for (const segment of prose) expect(segment.text).not.toMatch(/``|openui-lang|root =/);
    }
  });

  it('drops blank prose between and after fences', () => {
    expect(splitReply('```openui-lang\nroot = Stack([])\n```\n\n', true)).toEqual([
      { kind: 'openui', text: 'root = Stack([])', closed: true },
    ]);
  });

  it('keeps an unclosed fence open, with its partial last line', () => {
    expect(splitReply('Look:\n```openui-lang\nroot = Stack([t', false)).toEqual([
      { kind: 'prose', text: 'Look:' },
      { kind: 'openui', text: 'root = Stack([t', closed: false },
    ]);
  });

  it('leaves other code fences in prose, including an openui-lang line inside them', () => {
    const text = '````md\n```openui-lang\nroot = Stack([])\n```\n````\nDone.';

    expect(splitReply(text, true)).toEqual([{ kind: 'prose', text }]);
  });

  it('splits out a mermaid fence, open until its closing line arrives, without showing a cut-off closer', () => {
    const text = 'Flow:\n```mermaid\nflowchart LR\n  A --> B\n```\nAfter.';

    expect(splitReply(text.slice(0, text.indexOf('\nAfter') - 1), false)).toEqual([
      { kind: 'prose', text: 'Flow:' },
      { kind: 'mermaid', text: 'flowchart LR\n  A --> B', closed: false },
    ]);
    expect(splitReply(text, true)).toEqual([
      { kind: 'prose', text: 'Flow:' },
      { kind: 'mermaid', text: 'flowchart LR\n  A --> B', closed: true },
      { kind: 'prose', text: 'After.' },
    ]);
  });

  it('closes a fence only with a matching marker', () => {
    const text = '~~~openui-lang\nroot = Stack([t])\n```\n~~~\nAfter.';

    expect(splitReply(text, true)).toEqual([
      { kind: 'openui', text: 'root = Stack([t])\n```', closed: true },
      { kind: 'prose', text: 'After.' },
    ]);
  });
});
