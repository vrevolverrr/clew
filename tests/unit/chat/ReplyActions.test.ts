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
  it('reads a complete call of a known action', () => {
    expect(parseActionLine('@Title("Rayleigh scattering")')).toEqual({ name: 'Title', params: { text: 'Rayleigh scattering' } });
    expect(parseActionLine('  @Title("a \\"quoted\\" word")  ')).toEqual({ name: 'Title', params: { text: 'a "quoted" word' } });
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

  it('reads a highlight, and drops a line number that is no use without dropping the highlight', () => {
    expect(parseActionLine('@Highlight("the slope")')).toEqual({ name: 'Highlight', params: { quote: 'the slope' } });
    expect(parseActionLine('@Highlight("the slope", "Check this", "notes/optics.md", 42)')).toEqual({
      name: 'Highlight',
      params: { quote: 'the slope', comment: 'Check this', path: 'notes/optics.md', line: 42 },
    });
    expect(parseActionLine('@Highlight("the slope", "Check this", "notes/optics.md", 4.5)')).toEqual({
      name: 'Highlight',
      params: { quote: 'the slope', comment: 'Check this', path: 'notes/optics.md' },
    });
  });

  it('reads a blank comment as none, and cuts one that is too long', () => {
    expect(parseActionLine('@Highlight("the slope", "  ")')).toEqual({ name: 'Highlight', params: { quote: 'the slope' } });
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

  it('keeps a @ line that is not a known action as prose, once it ends', () => {
    expect(run(['@alice thinks so\n', '@Underline("x")\n'])).toEqual({ text: '@alice thinks so\n@Underline("x")\n', titles: [] });
  });

  it('drops a call of a known action with bad arguments instead of showing it', () => {
    expect(run(['Hi.\n@Highlight()\n@Title(3)\n@Title("Fine")\n'])).toEqual({ text: 'Hi.\n', titles: ['Fine'] });
    expect(run(['Hi.\n@Highlight()'])).toEqual({ text: 'Hi.\n', titles: [] });
  });

  it('keeps a @ line inside a code fence as code', () => {
    const text = 'Example:\n```text\n@Title("not a title")\n```\n````md\n```\n@Title("nor this")\n```\n````\n';

    expect(run([text])).toEqual({ text, titles: [] });
  });

  it('reads an action again after a fence closes', () => {
    expect(run(['```js\nx\n```\n@Title("After")\n'])).toEqual({ text: '```js\nx\n```\n', titles: ['After'] });
  });

  it('ends a reply whose last line has no newline', () => {
    expect(run(['Done.\n@Title("No newline")'])).toEqual({ text: 'Done.\n', titles: ['No newline'] });
    expect(run(['Done.\n@Title("Cut off'])).toEqual({ text: 'Done.\n@Title("Cut off', titles: [] });
  });
});
