import type { SkillSyntax } from '@/agents/types';
import { skillTokens, skillTrigger } from '@/context/skillSyntax';

const SLASH = { prefix: '/', atStart: true };
const DOLLAR = { prefix: '$', atStart: false };

describe('skillTrigger', () => {
  it('finds the slash name at the start of the input', () => {
    expect(skillTrigger('/sim', 4, SLASH)).toEqual({ start: 0, query: 'sim' });
    expect(skillTrigger('/', 1, SLASH)).toEqual({ start: 0, query: '' });
  });

  it('ignores a slash after the start, which Claude Code would not run', () => {
    expect(skillTrigger('why is a/b', 10, SLASH)).toBeNull();
    expect(skillTrigger('why /sim', 8, SLASH)).toBeNull();
  });

  it('finds a dollar name after whitespace anywhere in the input', () => {
    expect(skillTrigger('use $zeb', 8, DOLLAR)).toEqual({ start: 4, query: 'zeb' });
    expect(skillTrigger('$zeb', 4, DOLLAR)).toEqual({ start: 0, query: 'zeb' });
    expect(skillTrigger('costs US$5', 10, DOLLAR)).toBeNull();
  });

  it('stops once the name is followed by a space', () => {
    expect(skillTrigger('/simplify now', 13, SLASH)).toBeNull();
  });

  it('follows the cursor, not the end of the input', () => {
    expect(skillTrigger('/sim and more', 4, SLASH)).toEqual({ start: 0, query: 'sim' });
  });
});

describe('skillTokens', () => {
  const found = (text: string, syntax: SkillSyntax): string[] => skillTokens(text, syntax).map(({ start, end }) => text.slice(start, end));

  it('finds a slash name only at the start of the input', () => {
    expect(found('/review go', SLASH)).toEqual(['/review']);
    expect(found('/plugin:skill', SLASH)).toEqual(['/plugin:skill']);
    expect(found('go /review', SLASH)).toEqual([]);
  });

  it('skips a slash path and a lone slash', () => {
    expect(found('/usr/bin is on PATH', SLASH)).toEqual([]);
    expect(found('/ 2', SLASH)).toEqual([]);
  });

  it('finds every dollar name that follows whitespace or the start', () => {
    expect(found('$zebra then $outline now', DOLLAR)).toEqual(['$zebra', '$outline']);
    expect(found('line one\n$zebra', DOLLAR)).toEqual(['$zebra']);
  });

  it('skips dollar math', () => {
    expect(found('let $x$ and $x^2$ be', DOLLAR)).toEqual([]);
    expect(found('US$5', DOLLAR)).toEqual([]);
  });
});
