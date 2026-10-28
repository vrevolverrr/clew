import { inlineMathRanges } from '@/renderer/markdown/inlineMath';

const sources = (text: string) => inlineMathRanges(text).map((range) => range.source);

describe('inlineMathRanges', () => {
  it('finds each $...$ span with its source', () => {
    expect(inlineMathRanges('My answer: $\\sin x$ and $x^2$.')).toEqual([
      { start: 11, end: 19, source: '\\sin x' },
      { start: 24, end: 29, source: 'x^2' },
    ]);
  });

  it('leaves prices and lone dollar signs as text', () => {
    expect(sources('It costs $5 and $10 in total.')).toEqual([]);
    expect(sources('Pay $ 5 now, then $ 6')).toEqual([]);
    expect(sources('a $b')).toEqual([]);
  });

  it('keeps an escaped dollar sign and a dollar inside the maths apart', () => {
    expect(sources('\\$a$ and $\\$b$')).toEqual(['\\$b']);
  });

  it('skips display math', () => {
    expect(sources('$$x$$')).toEqual([]);
  });
});
