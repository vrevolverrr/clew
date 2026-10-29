import { figureText } from '@/renderer/figure/figureText';

describe('figureText', () => {
  it.each([
    ['a link', 'see [the proof](https://x.test/p)', 'see the proof'],
    ['an image', 'a ![cat](https://x.test/c.png) b', 'a cat b'],
    ['an embed', 'a ![[Note]] b', 'a  b'],
    ['a wikilink', '[[Note|the note]] and [[Other]]', 'the note and Other'],
    ['an autolink', 'at <https://x.test/a>', 'at https://x.test/a'],
    ['raw HTML', 'a <img src=x onerror=y> <b>bold</b>', 'a  bold'],
    ['a reference image', 'a ![cat][c] b\n\n[c]: https://x.test/c.png', 'a cat b\n\n'],
    ['a shortcut reference image', '![c]\n\n> [c]: <https://x.test/c.png>', '[c]\n\n'],
    ['\\href', '$\\href{https://x.test}{x^2}$', '$x^2$'],
  ])('strips %s', (_, input, output) => {
    expect(figureText(input)).toBe(output);
  });

  it('keeps a line that only looks like a link definition', () => {
    expect(figureText('[0, 1]: the domain')).toBe('[0, 1]: the domain');
  });

  it('leaves < and > inside maths alone', () => {
    expect(figureText('$a<b$ and $c>d$, $$x<y>z$$')).toBe('$a<b$ and $c>d$, $$x<y>z$$');
  });
});
