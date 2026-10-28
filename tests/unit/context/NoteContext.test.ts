import { NoteContext, type NoteSelection } from '@/context/NoteContext';
import { lineCount } from '@/shared/lineCount';

describe('lineCount', () => {
  it('counts the lines a selection spans, not the break that ends the last one', () => {
    expect(lineCount('a')).toBe(1);
    expect(lineCount('a\nb')).toBe(2);
    expect(lineCount('a\r\nb\r\n')).toBe(2);
    expect(lineCount('a\n\nb')).toBe(3);
  });
});

const selected = (key: string, path = 'a.md'): NoteSelection => ({ path, text: `text ${key}`, key });
const show = (path: string, selection: NoteSelection | null = null, keepSelection = false) => ({ path, selection, keepSelection });

describe('NoteContext', () => {
  it('follows the open note and its selection', () => {
    const context = new NoteContext();

    expect(context.update(show('a.md', selected('1')))).toBe(true);
    expect(context.note).toEqual({ path: 'a.md', excluded: false });
    expect(context.selection?.key).toBe('1');

    expect(context.update(show('a.md', selected('1')))).toBe(false);
    expect(context.update(show('a.md'))).toBe(true);
    expect(context.selection).toBeNull();
  });

  it('forgets the note when the editor shows no note', () => {
    const context = new NoteContext();
    context.update(show('a.md', selected('1')));

    expect(context.update(null)).toBe(true);
    expect(context.note).toBeNull();
    expect(context.selection).toBeNull();
  });

  it('keeps a selection that reading view dropped when the input took focus, but only for the same note', () => {
    const context = new NoteContext();
    context.update(show('a.md', selected('1')));

    expect(context.update(show('a.md', null, true))).toBe(false);
    expect(context.selection?.key).toBe('1');

    context.update(show('b.md', null, true));
    expect(context.selection).toBeNull();
  });

  it('does not offer a dismissed selection again until the student selects something else', () => {
    const context = new NoteContext();
    context.update(show('a.md', selected('1')));
    context.dismissSelection();

    expect(context.selection).toBeNull();
    context.update(show('a.md', selected('1')));
    expect(context.selection).toBeNull();

    context.update(show('a.md', selected('2')));
    expect(context.selection?.key).toBe('2');
  });

  it('dismisses a sent selection the student has since replaced, without dropping the new one', () => {
    const context = new NoteContext();
    const sent = selected('1');
    context.update(show('a.md', sent));
    context.update(show('a.md', selected('2')));

    context.dismissSelection(sent);

    expect(context.selection?.key).toBe('2');
    context.update(show('a.md', sent));
    expect(context.selection).toBeNull();
  });

  it('offers a dismissed selection again after the student deselects it', () => {
    const context = new NoteContext();
    context.update(show('a.md', selected('1')));
    context.dismissSelection();
    context.update(show('a.md'));

    context.update(show('a.md', selected('1')));

    expect(context.selection?.key).toBe('1');
  });

  it('remembers a dismissed selection for each note', () => {
    const context = new NoteContext();
    context.update(show('a.md', selected('1')));
    context.dismissSelection();
    context.update(show('b.md', selected('7', 'b.md')));
    context.dismissSelection();

    context.update(show('a.md', selected('1')));

    expect(context.selection).toBeNull();
  });

  it('redraws for a growing selection only when its line count changes', () => {
    const context = new NoteContext();
    context.update(show('a.md', { path: 'a.md', text: 'one', key: '0-3' }));

    expect(context.update(show('a.md', { path: 'a.md', text: 'one two', key: '0-7' }))).toBe(false);
    expect(context.selection?.text).toBe('one two');
    expect(context.update(show('a.md', { path: 'a.md', text: 'one\ntwo', key: '0-7' }))).toBe(true);
  });

  it('leaves the note out until the student includes it again or opens another note', () => {
    const context = new NoteContext();
    context.update(show('a.md'));

    context.toggleNote();
    expect(context.note).toEqual({ path: 'a.md', excluded: true });
    expect(context.update(show('a.md'))).toBe(false);

    context.update(show('b.md'));
    expect(context.note).toEqual({ path: 'b.md', excluded: false });

    context.update(show('a.md'));
    expect(context.note).toEqual({ path: 'a.md', excluded: false });
  });
});
