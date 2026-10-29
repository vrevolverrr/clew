import type { App, Component } from 'obsidian';
import { FileView, MarkdownView } from 'obsidian';

import type { ChatContext } from '@/context/ChatContext';
import { NoteContext, type NoteSelection, type NoteSource, type OpenDocumentState } from '@/context/NoteContext';
import { lineCount } from '@/shared/lineCount';
import { readViewport } from '@/shared/obsidian/viewport';

/**
 * Follows what the next turn will carry from the open document, and reads it fresh when the turn is sent.
 * It follows the editor until `owner` closes. Obsidian has no selection event, so it listens to the browser's
 * `selectionchange` (which CodeMirror also uses, hence the frame of delay) and to the events that change the open note.
 * Focus inside the owner's pane keeps a reading-view selection that the browser clears when the input takes focus.
 */
export class OpenDocument {
  private readonly context = new NoteContext();
  private view: FileView | null = null;
  private readonly scope: HTMLElement;
  private chatSelection: NoteSelection | null = null;
  private consumedChat: string | null = null;

  constructor(
    private readonly owner: Component & { app: App; contentEl: HTMLElement },
    /** `sent` is true when a selection left because a turn carried it. */
    private readonly changed: (state: OpenDocumentState, sent: boolean, animate: boolean) => void,
  ) {
    this.scope = owner.contentEl;
    let frame: number | null = null;
    const schedule = (): void => {
      frame ??= window.requestAnimationFrame(() => {
        frame = null;
        this.refresh();
      });
    };
    owner.register(() => frame !== null && window.cancelAnimationFrame(frame));
    const listen = (doc: Document): void => owner.registerDomEvent(doc, 'selectionchange', schedule);
    listen(this.scope.ownerDocument);
    if (this.scope.ownerDocument !== document) listen(document);
    const { workspace } = owner.app;
    owner.registerEvent(workspace.on('window-open', (_, win) => listen(win.document)));
    owner.registerEvent(workspace.on('active-leaf-change', schedule));
    owner.registerEvent(workspace.on('file-open', schedule));
    owner.registerEvent(workspace.on('layout-change', schedule));
    this.refresh();
  }

  /** The document open in the editor, whether or not the turn carries it. */
  get path(): string {
    return this.context.note?.path ?? '';
  }

  /** What a turn sent now would carry. */
  read(): Pick<ChatContext, 'note' | 'selection'> {
    this.refresh();
    const { note } = this.context;
    const selection = this.chatSelection ?? this.context.selection;
    const view = this.view;
    return {
      ...(note && !note.excluded && view ? { note: { path: note.path, viewport: readViewport(view) } } : {}),
      ...(selection ? { selection } : {}),
    };
  }

  toggleNote(): void {
    this.context.toggleNote();
    this.render();
  }

  removeSelection(): void {
    if (this.chatSelection) this.consumedChat = this.chatSelection.key;
    this.chatSelection = null;
    this.context.dismissSelection();
    this.render();
  }

  /** Refreshes a newly visible chat without replaying chip animations. */
  activate(): void {
    this.refresh(false);
  }

  /** Counts a selection as sent: it is not offered again until the student selects something else. */
  sent(selection: NoteSelection): void {
    if (selection.source === 'chat') {
      this.consumedChat = selection.key;
      if (this.chatSelection?.key === selection.key) this.chatSelection = null;
    } else this.context.dismissSelection(selection);
    this.render(true);
  }

  private refresh(animate = true): void {
    if (this.scope.hidden) return;
    const selection = this.scope.ownerDocument.getSelection();
    const messages = this.scope.querySelector('.clew-messages');
    const text = selection?.toString() ?? '';
    if (text.trim() && selection?.anchorNode && selection.focusNode
      && messages?.contains(selection.anchorNode) && messages.contains(selection.focusNode)) {
      const range = selection.getRangeAt(0);
      const before = range.cloneRange();
      before.selectNodeContents(messages);
      before.setEnd(range.startContainer, range.startOffset);
      const key = `${before.toString().length}:${text}`;
      if (key !== this.consumedChat) {
        this.consumedChat = null;
        this.chatSelection = { path: this.scope.id.replace('clew-panel-', ''), source: 'chat', text, key };
        this.context.dismissSelection();
      }
    }
    const view = this.owner.app.workspace.getMostRecentLeaf(this.owner.app.workspace.rootSplit)?.view;
    this.view = view instanceof FileView && view.file ? view : null;
    if (text.trim() && selection?.anchorNode && this.view?.contentEl.contains(selection.anchorNode)) {
      this.chatSelection = null;
      this.consumedChat = null;
    }
    this.context.update(this.view && this.source(this.view));
    if (this.chatSelection) this.context.dismissSelection();
    this.render(false, animate);
  }

  private source(view: FileView): NoteSource {
    const path = view.file!.path;
    if (!(view instanceof MarkdownView) || view.getMode() === 'preview') {
      const selection = this.pageSelection(view, path);
      return { path, selection, keepSelection: this.scope.contains(this.scope.ownerDocument.activeElement) };
    }
    const { editor } = view;
    const text = editor.getSelection();
    if (!text.trim()) return { path, selection: null, keepSelection: false };
    const from = editor.getCursor('from');
    const to = editor.getCursor('to');
    return {
      path,
      selection: { path, text, startLine: from.line + 1, key: `${editor.posToOffset(from)}-${editor.posToOffset(to)}:${text}` },
      keepSelection: false,
    };
  }

  /** Reading view and other documents (a PDF, a Base) have no editor selection, so read the text the student marked in the page. */
  private pageSelection(view: FileView, path: string): NoteSelection | null {
    const selection = view.containerEl.ownerDocument.getSelection();
    const text = selection?.toString() ?? '';
    if (!text.trim() || !selection?.anchorNode || !view.contentEl.contains(selection.anchorNode)) return null;
    const anchor = selection.anchorNode.instanceOf(Element) ? selection.anchorNode : selection.anchorNode.parentElement;
    const page = Number(anchor?.closest<HTMLElement>('.page[data-page-number]')?.dataset.pageNumber) || undefined;
    return { path, text, page, key: text };
  }

  private render(sent = false, animate = true): void {
    const { note } = this.context;
    const selection = this.chatSelection ?? this.context.selection;
    const file = this.view?.file;
    this.changed(
      {
        note: note ? {
          path: note.path,
          icon: this.view?.getIcon() ?? 'file-text',
          label: (file?.extension === 'md' ? file.basename : file?.name) ?? note.path,
          excluded: note.excluded,
        } : null,
        selection: selection ? { lines: lineCount(selection.text), source: selection.source } : null,
      },
      sent,
      animate,
    );
  }
}
