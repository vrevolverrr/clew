import { lineCount } from '@/shared/lineCount';

export interface NoteSelection {
  path: string;
  /** A chat selection names its chat id in path; an omitted source names a vault file. */
  source?: 'chat';
  text: string;
  /** 1-indexed; unknown in reading view, which has no source positions. */
  startLine?: number;
  /** 1-indexed; set for a paged document such as a PDF. */
  page?: number;
  /** Tells two selections of the same note apart: the text and, where positions exist, where it sits. */
  key: string;
}

/** A selection as a turn keeps it: where it was and what it said, without the key that tells live selections apart. */
export type NoteQuote = Omit<NoteSelection, 'key'>;

/** What the chips above the input show: the open note and the selection a turn sent now would carry. */
export interface OpenDocumentState {
  note?: { path: string; icon: string; label: string; excluded: boolean } | null;
  selection?: { lines: number; source?: 'chat' } | null;
}

/** What the editor shows right now: the open note and its selection, if any. */
export interface NoteSource {
  path: string;
  selection: NoteSelection | null;
  /** Reading view loses its selection when the chat input takes focus, so an empty one then is not a deselection. */
  keepSelection: boolean;
}

/**
 * What the next turn will carry from the open note: the note itself, which the student can leave out, and the selected text,
 * which stays until sent or dismissed and is not offered again until the student selects something else.
 */
export class NoteContext {
  private noteSource: string | null = null;
  private excluded: string | null = null;
  private current: NoteSelection | null = null;
  private readonly consumed = new Map<string, string>();

  get note(): { path: string; excluded: boolean } | null {
    return this.noteSource === null ? null : { path: this.noteSource, excluded: this.excluded === this.noteSource };
  }

  get selection(): NoteSelection | null {
    return this.current;
  }

  /** Takes in the editor's state; true when what the chat shows has changed. */
  update(source: NoteSource | null): boolean {
    const before = this.signature();
    if (source) {
      this.follow(source);
    } else {
      this.noteSource = null;
      this.current = null;
    }
    return before !== this.signature();
  }

  toggleNote(): void {
    if (this.noteSource === null) return;
    this.excluded = this.excluded === this.noteSource ? null : this.noteSource;
  }

  /**
   * Ignores a selection, the current one unless another is given (a sent one the student has since replaced), until the
   * student selects something else in that note.
   */
  dismissSelection(selection: NoteSelection | null = this.current): void {
    if (!selection) return;
    this.consumed.set(selection.path, selection.key);
    if (this.current?.path === selection.path && this.current.key === selection.key) this.current = null;
  }

  private follow({ path, selection, keepSelection }: NoteSource): void {
    this.noteSource = path;
    if (this.excluded !== path) this.excluded = null;
    if (selection && this.consumed.get(path) === selection.key) {
      this.current = null;
      return;
    }
    this.consumed.delete(path);
    if (selection) this.current = selection;
    else if (!keepSelection || this.current?.path !== path) this.current = null;
  }

  /** Covers what the chat draws, so a selection that grows in place does not redraw it unless its line count changes. */
  private signature(): string {
    const selected = this.current && lineCount(this.current.text);
    return [this.noteSource, this.excluded === this.noteSource, this.current?.path, selected].join('\0');
  }
}

/** The quote a turn keeps from the selection it carried; a blank selection is not one. */
export function quoteOf(selection: NoteQuote | undefined): NoteQuote | undefined {
  if (!selection?.text.trim()) return undefined;
  const { text, path, startLine, page, source } = selection;
  return { text, path, startLine, page, ...(source ? { source } : {}) };
}
