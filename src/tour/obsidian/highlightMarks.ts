import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

export const addMark = StateEffect.define<{ from: number; to: number }>();
export const clearMarks = StateEffect.define<null>();

const mark = Decoration.mark({ class: 'clew-highlight' });

/** The agent's marks in an editor. They move with the text as the student types, and go when their text is deleted. */
export const highlightMarks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    let next = marks.map(transaction.changes).update({ filter: (from, to) => to > from });
    for (const effect of transaction.effects) {
      if (effect.is(clearMarks)) next = Decoration.none;
      else if (effect.is(addMark)) next = next.update({ add: [mark.range(effect.value.from, effect.value.to)] });
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});
