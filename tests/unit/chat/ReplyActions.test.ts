import { parseActionLine, ReplyActions } from '@/chat/ReplyActions';

function run(chunks: string[]): { text: string; titles: string[] } {
  const filter = new ReplyActions();
  let text = '';
  const titles: string[] = [];
  for (const part of [...chunks.flatMap((chunk) => filter.push(chunk)), ...filter.flush()]) {
    if ('text' in part) text += part.text;
    else if (part.action.name === 'Title') titles.push(part.action.params.text);
  }
  return { text, titles };
}

const reply = 'The slope is wrong.\n\nWhich factor is missing?\n@Title("Chain rule slope")\n';

describe('parseActionLine', () => {
  it.each([
    ['a complete call of a known action', '@Title("Rayleigh scattering")', { name: 'Title', params: { text: 'Rayleigh scattering' } }],
    ['a padded call with escaped quotes', '  @Title("a \\"quoted\\" word")  ', { name: 'Title', params: { text: 'a "quoted" word' } }],
    ['a highlight', '@Highlight("the slope")', { name: 'Highlight', params: { quote: 'the slope' } }],
    ['a highlight with every argument', '@Highlight("the slope", "Check this", "notes/optics.md", 42)', {
      name: 'Highlight',
      params: { quote: 'the slope', comment: 'Check this', path: 'notes/optics.md', line: 42 },
    }],
    ['a highlight, dropping a line number that is no use', '@Highlight("the slope", "Check this", "notes/optics.md", 4.5)', {
      name: 'Highlight',
      params: { quote: 'the slope', comment: 'Check this', path: 'notes/optics.md' },
    }],
    ['null as a left-out argument', '@Highlight("the slope", null, "notes/optics.md")', { name: 'Highlight', params: { quote: 'the slope', path: 'notes/optics.md' } }],
    ['an exponent line number and a trailing comma', '@Highlight("the slope", null, null, 1e1,)', { name: 'Highlight', params: { quote: 'the slope', line: 10 } }],
    ['a line number with no leading digit, dropped as no use', '@Highlight("the slope", null, null, .5)', { name: 'Highlight', params: { quote: 'the slope' } }],
    ['a blank comment as none', '@Highlight("the slope", "  ")', { name: 'Highlight', params: { quote: 'the slope' } }],
  ])('reads %s', (_, line, want) => {
    expect(parseActionLine(line)).toEqual(want);
  });

  it.each([
    ['a line cut off mid-quote', '@Title("Rayleigh sca'],
    ['an unknown action', '@Underline("x")'],
    ['an action name from the object prototype', '@constructor("x")'],
    ['a call without the @', 'Title("x")'],
    ['prose that starts with @', '@alice what do you think (really)'],
  ])('rejects %s', (_, line) => {
    expect(parseActionLine(line)).toBeNull();
  });

  it.each([
    ['missing arguments', '@Title()'],
    ['an empty title', '@Title("  ")'],
    ['a title of the wrong type', '@Title(3)'],
    ['too many arguments', '@Title("a", "b")'],
    ['an overlong title', `@Title("${'a'.repeat(81)}")`],
    ['a highlight with no quote', '@Highlight(4)'],
  ])('calls %s invalid', (_, line) => {
    expect(parseActionLine(line)).toBe('invalid');
  });

  it('cuts a comment that is too long', () => {
    const long = parseActionLine(`@Highlight("the slope", "${'a'.repeat(200)}")`);
    expect(long).toMatchObject({ name: 'Highlight', params: { comment: 'a'.repeat(160) } });
  });

  it.each([
    ['a comment that is not text', '@Highlight("the slope", 42)'],
    ['an empty path', '@Highlight("the slope", "Check", "")'],
    ['a path that is not text', '@Highlight("the slope", "Check", 7)'],
    ['a one-word stub of a quote', '@Highlight("is")'],
  ])('calls a highlight with %s invalid', (_, line) => {
    expect(parseActionLine(line)).toBe('invalid');
  });
});

describe('ReplyActions', () => {
  it('removes the action line and reports the action', () => {
    expect(run([reply])).toEqual({ text: 'The slope is wrong.\n\nWhich factor is missing?\n', titles: ['Chain rule slope'] });
  });

  it('gives the same result at every chunk boundary', () => {
    for (let cut = 1; cut < reply.length; cut += 1) {
      expect(run([reply.slice(0, cut), reply.slice(cut)])).toEqual(run([reply]));
    }
  });

  it('shows prose as soon as it arrives and holds only a line that starts with @', () => {
    const filter = new ReplyActions();

    expect(filter.push('Look at ')).toEqual([{ text: 'Look at ' }]);
    expect(filter.push('this.\n@Tit')).toEqual([{ text: 'this.\n' }]);
    expect(filter.push('le("Fo')).toEqual([]);
    expect(filter.push('o")\n')).toEqual([{ action: { name: 'Title', params: { text: 'Foo' } } }]);
  });

  it('keeps each action between the prose before and after it', () => {
    const filter = new ReplyActions();

    expect(filter.push('Look here.\n@Highlight("the slope")\nThen this.\n')).toEqual([
      { text: 'Look here.\n' },
      { action: { name: 'Highlight', params: { quote: 'the slope' } } },
      { text: 'Then this.\n' },
    ]);
  });

  const fenced = 'Example:\n```text\n@Title("not a title")\n```\n````md\n```\n@Title("nor this")\n```\n````\n';

  it.each([
    ['keeps a @ line that is not a known action as prose, once it ends', ['@alice thinks so\n', '@Underline("x")\n'], { text: '@alice thinks so\n@Underline("x")\n', titles: [] }],
    ['drops a call of a known action with bad arguments instead of showing it', ['Hi.\n@Highlight()\n@Title(3)\n@Title("Fine")\n'], { text: 'Hi.\n', titles: ['Fine'] }],
    ['drops a bad call on a last line with no newline', ['Hi.\n@Highlight()'], { text: 'Hi.\n', titles: [] }],
    ['keeps a @ line inside a code fence as code', [fenced], { text: fenced, titles: [] }],
    ['reads an action again after a fence closes', ['```js\nx\n```\n@Title("After")\n'], { text: '```js\nx\n```\n', titles: ['After'] }],
  ])('%s', (_, chunks, want) => {
    expect(run(chunks)).toEqual(want);
  });

  it('ends a reply whose last line has no newline', () => {
    expect(run(['Done.\n@Title("No newline")'])).toEqual({ text: 'Done.\n', titles: ['No newline'] });
    expect(run(['Done.\n@Title("Cut off'])).toEqual({ text: 'Done.\n@Title("Cut off', titles: [] });
  });
});
