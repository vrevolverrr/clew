import { findQuote, inCallout, quoteMatches } from '@/tour/locateQuote';

const NOTE = ['# Optics', 'Light scatters.', '', 'Light scatters.', 'The sky is blue.'].join('\n');

const locateQuote = (content: string, quote: string, line?: number) => findQuote(content, quote, { line })?.span ?? null;

describe('locateQuote', () => {
  it('finds the quote and returns its offsets', () => {
    const span = locateQuote(NOTE, 'The sky is blue.');
    expect(NOTE.slice(span!.start, span!.end)).toBe('The sky is blue.');
  });

  it('takes the match nearest the line the quote was selected on', () => {
    const first = NOTE.indexOf('Light');
    const second = NOTE.lastIndexOf('Light');
    expect(locateQuote(NOTE, 'Light scatters.', 2)?.start).toBe(first);
    expect(locateQuote(NOTE, 'Light scatters.', 4)?.start).toBe(second);
  });

  it('matches text whose line breaks and spacing differ from the source', () => {
    expect(locateQuote('a b\nc', 'a  b c')).toEqual({ start: 0, end: 5 });
  });

  it('treats the quote as text, not a pattern', () => {
    expect(locateQuote('price (a+b)*2 total', '(a+b)*2')).toEqual({ start: 6, end: 13 });
  });

  it('returns null when the text is gone or empty', () => {
    expect(locateQuote(NOTE, 'Rayleigh')).toBeNull();
    expect(locateQuote(NOTE, '  ')).toBeNull();
  });

  describe('against the way a model quotes', () => {
    const slice = (content: string, quote: string): string | undefined => {
      const span = locateQuote(content, quote);
      return span ? content.slice(span.start, span.end) : undefined;
    };

    it('ignores Markdown marks on either side', () => {
      expect(slice('The **slope** is `m = dy/dx` here.', 'The slope is m = dy/dx here')).toBe('The **slope** is `m = dy/dx` here');
      expect(slice('The slope is steep.', 'The **slope** is steep')).toBe('The slope is steep');
      expect(slice('let $x^2$ grow', 'let x^2 grow')).toBe('let $x^2$ grow');
    });

    it('matches across hard-wrapped lines and list or quote prefixes', () => {
      expect(slice('- first idea\n  continues here\n- next', 'first idea continues here')).toBe('first idea\n  continues here');
      expect(slice('> light bends\n> at the edge', 'light bends at the edge')).toBe('light bends\n> at the edge');
      expect(slice('Intro\n1. one\n2. two', 'one two')).toBe('one\n2. two');
    });

    it('reads a callout as its text, with or without the marker the quote copied', () => {
      const note = 'Intro\n> [!note] Block count\n> of a clustered relation';
      const body = 'Block count\n> of a clustered relation';
      expect(slice(note, '> [!note] Block count of a clustered relation')).toBe(body);
      expect(slice(note, 'Block count of a clustered relation')).toBe(body);
      expect(slice('> [!tip]- Folded\n> body', '> [!tip]- Folded body')).toBe('Folded\n> body');
    });

    it('treats curly quotes, dashes and ellipses as their plain forms', () => {
      expect(slice('It\'s a "test" – really…', 'It’s a “test” - really...')).toBe('It\'s a "test" – really…');
    });

    it('falls back to ignoring case only when the exact case is absent', () => {
      expect(slice('Snell\'s Law applies', 'snell\'s law applies')).toBe('Snell\'s Law applies');
      expect(quoteMatches('Law and law', 'law')).toEqual([{ start: 8, end: 11 }]);
    });

    it('does not take a decimal for a list marker', () => {
      expect(slice('see\n3.5 meters', 'see 3.5 meters')).toBe('see\n3.5 meters');
    });
  });

  it('counts the places a quote occurs', () => {
    expect(findQuote(NOTE, 'Light scatters.')?.count).toBe(2);
    expect(findQuote(NOTE, 'The sky is blue.')?.count).toBe(1);
  });

  describe('whole words', () => {
    it('skips a match inside a longer word, and keeps one at word edges or punctuation', () => {
      expect(quoteMatches('concatenate the cat.', 'cat', true)).toEqual([{ start: 16, end: 19 }]);
      expect(quoteMatches('concatenate the cat.', 'cat')).toHaveLength(2);
      expect(quoteMatches('f(x)=2x', '(x)=', true)).toEqual([{ start: 1, end: 5 }]);
    });

    it('treats the line as a hint for where to look', () => {
      expect(findQuote(NOTE, 'Light scatters.', { line: 4, wholeWords: true })?.span.start).toBe(NOTE.lastIndexOf('Light'));
    });
  });
});

const note = ['Intro line', '> [!note] Title', '> First body line', '> second body line', '', '> a plain quote', 'After'].join('\n');
const at = (text: string) => note.indexOf(text);

describe('inCallout', () => {
  it('is true on the title and every body line of a callout', () => {
    expect(inCallout(note, at('Title'))).toBe(true);
    expect(inCallout(note, at('First'))).toBe(true);
    expect(inCallout(note, at('second'))).toBe(true);
  });

  it('is false outside a callout, in a plain quote, and on the line after one', () => {
    expect(inCallout(note, at('Intro'))).toBe(false);
    expect(inCallout(note, at('plain'))).toBe(false);
    expect(inCallout(note, at('After'))).toBe(false);
  });

  it('is false for the empty line that ends a callout', () => {
    expect(inCallout(note, note.indexOf('\n\n') + 1)).toBe(false);
  });
});
