import { countFigures, replaceFigures, splitReply } from '@/chat/splitReply';

const reply = [
  'The slope is wrong.',
  '```figure',
  'root = Stack([t])',
  't = TextContent("Inner function")',
  '```',
  'Which factor is missing?',
].join('\n');

describe('splitReply', () => {
  it('splits prose and figure fences in order', () => {
    expect(splitReply(reply, true)).toEqual([
      { kind: 'prose', text: 'The slope is wrong.' },
      { kind: 'figure', text: 'root = Stack([t])\nt = TextContent("Inner function")', closed: true },
      { kind: 'prose', text: 'Which factor is missing?' },
    ]);
  });

  it('never shows fence syntax as prose at any chunk boundary', () => {
    for (let end = 1; end <= reply.length; end += 1) {
      const prose = splitReply(reply.slice(0, end), false).filter((s) => s.kind === 'prose');
      for (const segment of prose) expect(segment.text).not.toMatch(/``|figure|root =/);
    }
  });

  it.each([
    ['drops blank prose between and after fences', '```figure\nroot = Stack([])\n```\n\n', [
      { kind: 'figure', text: 'root = Stack([])', closed: true },
    ]],
    ['leaves other code fences in prose, including a figure line inside them', '````md\n```figure\nroot = Stack([])\n```\n````\nDone.', [
      { kind: 'prose', text: '````md\n```figure\nroot = Stack([])\n```\n````\nDone.' },
    ]],
    ['closes a fence only with a matching marker', '~~~figure\nroot = Stack([t])\n```\n~~~\nAfter.', [
      { kind: 'figure', text: 'root = Stack([t])\n```', closed: true },
      { kind: 'prose', text: 'After.' },
    ]],
    ['keeps a jsx fence as code', '```jsx\n<Row />\n```', [{ kind: 'prose', text: '```jsx\n<Row />\n```' }]],
  ])('%s', (_, text, want) => {
    expect(splitReply(text, true)).toEqual(want);
  });

  it('keeps an unclosed fence open, with its partial last line', () => {
    expect(splitReply('Look:\n```figure\nroot = Stack([t', false)).toEqual([
      { kind: 'prose', text: 'Look:' },
      { kind: 'figure', text: 'root = Stack([t', closed: false },
    ]);
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
});

describe('countFigures and replaceFigures', () => {
  const reply = ['Intro.', '```figure', 'one', '```', '```mermaid', 'flowchart LR', '```', '```jsx', '<Row />', '```', '```figure', 'two', '```', 'End.'].join('\n');

  it('count figures, not other fences', () => {
    expect(countFigures(reply)).toBe(2);
  });

  it('replace only the figure numbered in the fixes', () => {
    expect(replaceFigures(reply, new Map([[4, 'fixed']]), 3)).toBe(reply.replace('two', 'fixed'));
  });

  it('count an unclosed last figure, and close it when it is replaced', () => {
    const open = 'Look:\n```figure\nbroken(';
    expect(countFigures(open)).toBe(1);
    expect(replaceFigures(open, new Map([[0, 'fixed']]), 0)).toBe('Look:\n```figure\nfixed\n```');
  });
});

