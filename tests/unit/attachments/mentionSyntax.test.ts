import { mentionToken, mentionTokens, mentionTrigger } from '@/attachments/mentionSyntax';

describe('mentionTrigger', () => {
  it('finds the name after an @ at the start or after whitespace', () => {
    expect(mentionTrigger('@man', 4)).toEqual({ start: 0, query: 'man' });
    expect(mentionTrigger('read @man', 9)).toEqual({ start: 5, query: 'man' });
    expect(mentionTrigger('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('ignores an @ inside a word, such as an email address', () => {
    expect(mentionTrigger('mail me@example.com', 19)).toBeNull();
  });

  it('stops once the name is followed by a space', () => {
    expect(mentionTrigger('@man now', 8)).toBeNull();
  });

  it('follows the cursor, not the end of the input', () => {
    expect(mentionTrigger('@man and more', 4)).toEqual({ start: 0, query: 'man' });
  });
});

describe('mentionTokens', () => {
  const found = (text: string, tokens: string[]): string[] => mentionTokens(text, tokens).map(({ start, end }) => text.slice(start, end));

  it('finds a picked file named with spaces, at the start or after whitespace', () => {
    expect(found('compare @Week 1.md with @Week 2.md.', ['Week 1.md', 'Week 2.md'])).toEqual(['@Week 1.md']);
    expect(found('@Week 1.md', ['Week 1.md'])).toEqual(['@Week 1.md']);
  });

  it('needs whitespace or the end after the token, so a longer name is not a match', () => {
    expect(found('@a.md.bak and @a.md', ['a.md'])).toEqual(['@a.md']);
  });

  it('prefers the longer token where one holds another', () => {
    expect(found('@a.md (2) and @a.md', ['a.md', 'a.md (2)'])).toEqual(['@a.md (2)', '@a.md']);
  });

  it('reads regex characters in a name as plain text', () => {
    expect(found('see @c++ (1).md now', ['c++ (1).md'])).toEqual(['@c++ (1).md']);
    expect(found('see @cxx (1).md now', ['c++ (1).md'])).toEqual([]);
  });

  it('ignores an @ inside a word, and finds nothing without tokens', () => {
    expect(found('me@a.md', ['a.md'])).toEqual([]);
    expect(found('@a.md', [])).toEqual([]);
  });

  it('gives the token without its @', () => {
    expect(mentionTokens('hi @a.md', ['a.md'])).toEqual([{ start: 3, end: 8, token: 'a.md' }]);
  });
});

describe('mentionToken', () => {
  it('names a file by its name, and numbers it when another picked file has the name', () => {
    expect(mentionToken('a.md', new Set())).toBe('a.md');
    expect(mentionToken('a.md', new Set(['a.md']))).toBe('a.md (2)');
    expect(mentionToken('a.md', new Set(['a.md', 'a.md (2)']))).toBe('a.md (3)');
  });
});
