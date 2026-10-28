import type { OpenDocumentState } from '@/context/NoteContext';
import { Chip, type ChipExit } from '@/shared/view/Chip';

export interface ContextChipsHost {
  toggleNote(): void;
  removeSelection(): void;
}

/**
 * The chips above the input that show what the next turn carries. A chip lives as long as its subject: new state
 * updates it in place, so only a chip that arrives or leaves animates.
 */
export class ContextChips {
  private note: Chip | null = null;
  private selection: Chip | null = null;
  /** The row the chips sit in. */
  readonly tray: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly host: ContextChipsHost,
  ) {
    this.tray = parent.createDiv({ cls: 'clew-context-tray' });
  }

  set({ note, selection }: OpenDocumentState, exit: ChipExit = 'dropped', animate = true): void {
    if (note) {
      this.note ??= this.noteChip();
      this.note.set(note.icon, note.label, note.excluded ? `${note.path} (left out; click to include)` : `${note.path} (click to leave out)`, undefined, animate);
      this.note.el.toggleClass('is-excluded', note.excluded);
      this.note.el.setAttribute('aria-pressed', String(!note.excluded));
    } else {
      this.note?.leave(exit);
      this.note = null;
    }
    if (selection) {
      this.selection ??= new Chip(this.tray, { label: 'Remove selection', onClick: () => this.host.removeSelection() });
      this.selection.set(selection.source === 'chat' ? 'messages-square' : 'text-select', `${selection.lines} ${selection.lines === 1 ? 'line' : 'lines'} selected`, selection.source === 'chat' ? 'Selected chat text, sent with your next message' : 'Selected text, sent with your next message', undefined, animate);
    } else {
      this.selection?.leave(exit);
      this.selection = null;
    }
  }

  private noteChip(): Chip {
    const chip = new Chip(this.tray);
    chip.el.setAttribute('role', 'button');
    chip.el.tabIndex = 0;
    chip.el.addEventListener('click', () => this.host.toggleNote());
    chip.el.addEventListener('keydown', (event) => {
      if (event.target !== chip.el || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      this.host.toggleNote();
    });
    return chip;
  }
}
