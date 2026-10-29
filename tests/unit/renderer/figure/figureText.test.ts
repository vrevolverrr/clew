import { figureText } from '@/renderer/figure/figureText';

describe('figureText', () => {
  it.each([
    ['a link', 'see [the proof](https://x.test/p)', 'see the proof'],
    ['an image', 'a ![cat](https://x.test/c.png) b', 'a cat b'],
    ['an embed', 'a ![[Note]] b', 'a  b'],
    ['a wikilink', '[[Note|the note]] and [[Other]]', 'the note and Other'],
    ['an autolink', 'at <https://x.test/a>', 'at https://x.test/a'],
    ['raw HTML', 'a <img src=x onerror=y> <b>bold</b>', 'a  bold'],
    ['\\href', '$\\href{https://x.test}{x^2}$', '$x^2$'],
  ])('strips %s', (_, input, output) => {
    expect(figureText(input)).toBe(output);
  });

  it('leaves < and > inside maths alone', () => {
    expect(figureText('$a<b$ and $c>d$, $$x<y>z$$')).toBe('$a<b$ and $c>d$, $$x<y>z$$');
  });
});
