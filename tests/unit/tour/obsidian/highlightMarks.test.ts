import { EditorState } from '@codemirror/state';

import { addMark, clearMarks, highlightMarks } from '@/tour/obsidian/highlightMarks';

function marked(state: EditorState): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  state.field(highlightMarks).between(0, state.doc.length, (from, to) => void out.push([from, to]));
  return out;
}

const start = EditorState.create({ doc: 'The sky is blue.', extensions: [highlightMarks] });
const withMark = start.update({ effects: addMark.of({ from: 4, to: 7 }) }).state;

describe('highlightMarks', () => {
  it('holds each mark added', () => {
    const two = withMark.update({ effects: addMark.of({ from: 11, to: 15 }) }).state;

    expect(marked(two)).toEqual([[4, 7], [11, 15]]);
  });

  it('moves a mark with the text around it', () => {
    expect(marked(withMark.update({ changes: { from: 0, insert: 'Look: ' } }).state)).toEqual([[10, 13]]);
  });

  it('drops a mark whose text is deleted, and keeps one that only lost its neighbours', () => {
    expect(marked(withMark.update({ changes: { from: 3, to: 8 } }).state)).toEqual([]);
    expect(marked(withMark.update({ changes: { from: 7, to: 16 } }).state)).toEqual([[4, 7]]);
  });

  it('clears every mark', () => {
    expect(marked(withMark.update({ effects: clearMarks.of(null) }).state)).toEqual([]);
  });
});
