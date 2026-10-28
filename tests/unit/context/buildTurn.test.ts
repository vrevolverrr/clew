import { buildTurn } from '@/context/buildTurn';

const SLASH = { prefix: '/', atStart: true };
const DOLLAR = { prefix: '$', atStart: false };

describe('buildTurn', () => {
  it('identifies quoted chat text independently of the open note', () => {
    expect(buildTurn({ message: 'Why?', skillSyntax: SLASH, note: { path: 'a.md' }, selection: { source: 'chat', path: 'chat-1', text: 'Earlier explanation' } })).toBe(
      '<note path="a.md"/>\n\n<selection source="chat" chatId="chat-1">\nEarlier explanation\n</selection>\n\nWhy?',
    );
  });
  it('points at the open document and carries the exact selection, before the message', () => {
    expect(
      buildTurn({
        message: 'why?',
        skillSyntax: SLASH,
        note: { path: 'Calc/Chain "rule".md', viewport: { unit: 'lines', from: 40, to: 95 } },
        selection: { path: 'Calc/Chain "rule".md', text: 'f(g(x))' },
      }),
    ).toBe(
      '<note path="Calc/Chain &quot;rule&quot;.md" lines="40-95"/>\n\n<selection path="Calc/Chain &quot;rule&quot;.md">\nf(g(x))\n</selection>\n\nwhy?',
    );
  });

  it('gives the line range of a selection whose position is known', () => {
    expect(buildTurn({ message: 'why?', skillSyntax: SLASH, selection: { path: 'a.md', text: 'x\ny\nz', startLine: 4 } })).toBe(
      '<selection path="a.md" lines="4-6">\nx\ny\nz\n</selection>\n\nwhy?',
    );
  });

  it('gives the page of a selection in a PDF', () => {
    expect(buildTurn({ message: 'why?', skillSyntax: SLASH, selection: { path: 'Week 1.pdf', text: 'Theorem 2', page: 7 } })).toBe(
      '<selection path="Week 1.pdf" page="7">\nTheorem 2\n</selection>\n\nwhy?',
    );
  });

  it('writes the viewport as pages, a single page, an open-ended line range, or nothing', () => {
    const note = (viewport?: { unit: 'lines' | 'pages'; from: number; to?: number }): string =>
      buildTurn({ message: 'hi', skillSyntax: SLASH, note: { path: 'a', viewport } }).split('\n')[0];
    expect(note({ unit: 'pages', from: 3, to: 4 })).toBe('<note path="a" pages="3-4"/>');
    expect(note({ unit: 'pages', from: 3, to: 3 })).toBe('<note path="a" pages="3"/>');
    expect(note({ unit: 'lines', from: 40 })).toBe('<note path="a" lines="40-"/>');
    expect(note()).toBe('<note path="a"/>');
  });

  it('names each file by its full path, after the note and before the selection', () => {
    expect(
      buildTurn({
        message: 'summarize',
        skillSyntax: SLASH,
        note: { path: 'a.md' },
        files: [
          { path: '/Users/me/Week "1".pdf' },
          { path: '/Users/me/notes.txt' },
        ],
        selection: { path: 'a.md', text: 'x' },
      }),
    ).toBe(
      '<note path="a.md"/>\n\n<attachment path="/Users/me/Week &quot;1&quot;.pdf"/>\n\n<attachment path="/Users/me/notes.txt"/>\n\n<selection path="a.md">\nx\n</selection>\n\nsummarize',
    );
  });

  it('carries the text of a file that has it, and marks a cut', () => {
    const files = [
      { path: '/v/a.json' },
      { path: '/v/big.md' },
      { path: '/v/b.pdf' },
    ];
    const fileTexts = new Map([
      ['/v/a.json', { text: '{\n}', lines: 2, truncated: false }],
      ['/v/big.md', { text: 'x\ny', lines: 2, truncated: true }],
    ]);
    expect(buildTurn({ message: 'go', skillSyntax: SLASH, files, fileTexts })).toBe(
      '<attachment path="/v/a.json" lines="1-2">\n{\n}\n</attachment>\n\n<attachment path="/v/big.md" lines="1-2" truncated="true">\nx\ny\n</attachment>\n\n<attachment path="/v/b.pdf"/>\n\ngo',
    );
  });

  it('names a file the agent loads itself as an @ mention, quoted so a space is safe', () => {
    expect(buildTurn({ message: 'go', skillSyntax: SLASH, files: [{ path: '/v/My Notes.md', mention: '@"/v/My Notes.md"' }] })).toBe('@"/v/My Notes.md"\n\ngo');
  });

  it('sends no empty message, so a file alone leaves no blank line behind it', () => {
    expect(buildTurn({ message: '', skillSyntax: SLASH, files: [{ path: '/a.pdf' }] })).toBe('<attachment path="/a.pdf"/>');
    expect(buildTurn({ message: '', skillSyntax: SLASH })).toBe('');
  });

  it('sends only the message when no document is open or nothing is selected', () => {
    expect(buildTurn({ message: 'hello', skillSyntax: SLASH, selection: { path: 'a.md', text: '  ' } })).toBe('hello');
  });

  it('starts with a message that begins with a slash command, which Claude Code runs only at the start', () => {
    expect(buildTurn({ message: '/review go', skillSyntax: SLASH, note: { path: 'a.md' }, selection: { path: 'a.md', text: 'x' } })).toBe(
      '/review go\n\n<note path="a.md"/>\n\n<selection path="a.md">\nx\n</selection>',
    );
  });

  it('keeps the note first for a skill read anywhere, and for a slash that names no skill', () => {
    expect(buildTurn({ message: '$review go', skillSyntax: DOLLAR, note: { path: 'a.md' } })).toBe('<note path="a.md"/>\n\n$review go');
    expect(buildTurn({ message: '/ go', skillSyntax: SLASH, note: { path: 'a.md' } })).toBe('<note path="a.md"/>\n\n/ go');
  });
});
