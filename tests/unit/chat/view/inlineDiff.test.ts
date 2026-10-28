import { inlineDiff, type ApprovalDiffPart } from '@/chat/view/inlineDiff';

const versions = (parts: readonly ApprovalDiffPart[]) => ({
  before: parts.filter((part) => part.kind !== 'added').map((part) => part.text).join(''),
  after: parts.filter((part) => part.kind !== 'removed').map((part) => part.text).join(''),
});

describe('inlineDiff', () => {
  it('preserves common prose between separate word replacements', () => {
    const before = 'The dashboard is available and runs a lot faster than before.';
    const after = 'The dashboard is live and runs twice as fast.';
    const parts = inlineDiff(before, after);
    expect(versions(parts)).toEqual({ before, after });
    expect(parts).toContainEqual({ kind: 'same', text: ' and runs ' });
    expect(parts).toContainEqual({ kind: 'removed', text: 'available' });
    expect(parts).toContainEqual({ kind: 'added', text: 'live' });
  });

  it.each([
    ['', ''], ['', 'added\n'], ['deleted\n', ''], ['same', 'same'],
    ['a b a', 'b a b'], ['a\r\n\tb  c', 'a\n b\t c'],
    ['数学 😀 e\u0301', '数值 🚀 é'], ['<script>\u0000\ud800', '<img>\u0000\udfff'],
  ])('retains every character from %j to %j', (before, after) => {
    expect(versions(inlineDiff(before, after))).toEqual({ before, after });
  });

  it('uses bounded work for large replacements while keeping common ends and all text', () => {
    const before = `Start ${'old '.repeat(2000)}end`;
    const after = `Start ${'new '.repeat(2000)}end`;
    const parts = inlineDiff(before, after);
    expect(versions(parts)).toEqual({ before, after });
    expect(parts).toHaveLength(4);
    expect(parts[0]).toEqual({ kind: 'same', text: 'Start ' });
    expect(parts.at(-1)).toEqual({ kind: 'same', text: ' end' });
  });

  it('groups replacements across shared spaces into readable phrases', () => {
    expect(inlineDiff('old one red two', 'new six blue seven')).toEqual([
      { kind: 'removed', text: 'old one red two' },
      { kind: 'added', text: 'new six blue seven' },
    ]);
  });

  it('reconstructs varied short strings with repeated words and whitespace', () => {
    const tokens = ['a', 'b', ' ', '\n', '.', '😀'];
    for (let seed = 0; seed < 160; seed++) {
      const before = Array.from({ length: seed % 13 }, (_, i) => tokens[(seed + i * 3) % tokens.length]).join('');
      const after = Array.from({ length: seed % 17 }, (_, i) => tokens[(seed * 7 + i * 5) % tokens.length]).join('');
      expect(versions(inlineDiff(before, after))).toEqual({ before, after });
    }
  });
});
