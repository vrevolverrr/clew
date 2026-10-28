import {
  normalizeLatexMathDelimiters,
} from '@/renderer/markdown/markdownMath';

describe('markdownMath', () => {
  describe('normalizeLatexMathDelimiters', () => {
    it('normalizes inline and display LaTeX delimiters', () => {
      const markdown = [
        'Inline \\(x<y\\).',
        '\\[',
        'y^2',
        '\\]',
      ].join('\n');

      expect(normalizeLatexMathDelimiters(markdown)).toBe([
        'Inline $x<y$.',
        '$$',
        'y^2',
        '$$',
      ].join('\n'));
    });

    it('preserves existing dollars and unmatched or escaped LaTeX delimiters', () => {
      expect(
        normalizeLatexMathDelimiters('Keep $x$ and $$y$$. Unmatched \\(z. Escaped \\\\(x\\\\).')
      ).toBe(
        'Keep $x$ and $$y$$. Unmatched \\(z. Escaped \\\\(x\\\\).'
      );
    });

    it('preserves delimiters in inline, fenced, and indented code', () => {
      const markdown = [
        '`inline \\(code\\)` and \\(math\\)',
        '```tex',
        '\\[fenced\\]',
        '```',
        '    \\(indented\\)',
      ].join('\n');

      expect(normalizeLatexMathDelimiters(markdown)).toBe([
        '`inline \\(code\\)` and $math$',
        '```tex',
        '\\[fenced\\]',
        '```',
        '    \\(indented\\)',
      ].join('\n'));
    });

    it('preserves link destinations, autolinks, wikilinks, and HTML tags', () => {
      const markdown = [
        '[\\(label\\)](https://host/a\\(b\\))',
        '<https://host/a\\(b\\)>',
        '[[page\\(id\\)]]',
        '<span title="\\(raw\\)">\\(visible\\)</span>',
      ].join('\n');

      expect(normalizeLatexMathDelimiters(markdown)).toBe([
        '[$label$](https://host/a\\(b\\))',
        '<https://host/a\\(b\\)>',
        '[[page\\(id\\)]]',
        '<span title="\\(raw\\)">$visible$</span>',
      ].join('\n'));
    });

    it.each([
      ['trims both inline boundaries', 'Inline \\(  x + y  \\).', 'Inline $x + y$.'],
      ['trims multiple padded inline expressions', String.raw`Inline \( a \) and \( b \).`, String.raw`Inline $a$ and $b$.`],
      ['trims inline-boundary tabs', 'Inline \\(	x + y	\\).', 'Inline $x + y$.'],
      ['keeps internal expression spacing', 'Inline \\(  x   +   y  \\).', 'Inline $x   +   y$.'],
      ['keeps backslash-escaped TeX spaces at boundaries', String.raw`Inline \(\ x\ \).`, String.raw`Inline $\ x\ $.`],
      ['keeps explicit TeX spacing commands against trimmed padding', String.raw`Inline \( \,x\, \).`, String.raw`Inline $\,x\,$.`],
      ['keeps whitespace-only inline expressions', 'Inline \\(  \\).', 'Inline $  $.'],
      ['keeps whitespace-only inline expressions containing a newline', 'Inline \\( \n \\).', 'Inline $ \n $.'],
      ['keeps empty inline expressions', 'Inline \\(\\).', 'Inline $$.'],
      ['keeps unmatched inline closers with padding', 'Keep x + y \\).', 'Keep x + y \\).'],
      ['keeps unmatched inline openers with padding', 'Keep \\( x + y.', 'Keep \\( x + y.'],
      ['keeps display expression padding', 'Display \\[  x + y  \\].', 'Display $$  x + y  $$.'],
      ['keeps padded inline delimiters in protected Markdown', '`\\(  x  \\)` and [label](https://host/a\\(  x  \\)) and <span title="\\(  x  \\)">ok</span>', '`\\(  x  \\)` and [label](https://host/a\\(  x  \\)) and <span title="\\(  x  \\)">ok</span>'],
    ])('%s', (_name, markdown, expected) => {
      expect(normalizeLatexMathDelimiters(markdown)).toBe(expected);
    });

    it('preserves raw HTML bodies', () => {
      const markdown = '<pre>\n\\(literal\\)\n</pre>\n\\(visible\\)';
      expect(normalizeLatexMathDelimiters(markdown)).toBe(
        '<pre>\n\\(literal\\)\n</pre>\n$visible$'
      );
    });
  });
});
