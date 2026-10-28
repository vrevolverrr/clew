import type { App, EditorPosition } from 'obsidian';
import { MarkdownView, Notice } from 'obsidian';
import type { NoteQuote } from '@/context/NoteContext';
import { findQuote } from '@/tour/locateQuote';
import { leafOfFile } from '@/shared/obsidian/leafOfFile';

/**
 * Opens the document a quote came from and brings the quoted text into view. The document may have changed since the
 * message was sent, so the text is searched for first, the saved line is the fallback, and the student is told which.
 */
export async function openQuote(app: App, quote: NoteQuote): Promise<void> {
  const file = app.vault.getFileByPath(quote.path);
  if (!file) {
    new Notice(`${quote.path} is no longer in the vault.`);
    return;
  }
  const leaf = leafOfFile(app, file) ?? app.workspace.getLeaf('tab');
  // `active` selects the tab itself; `revealLeaf` would also flash its header.
  await leaf.openFile(file, { active: true, ...(quote.page && { eState: { subpath: `#page=${quote.page}` } }) });

  const view = leaf.view;
  if (!(view instanceof MarkdownView)) return;
  const editor = view.editor;
  const span = findQuote(await app.vault.cachedRead(file), quote.text, { line: quote.startLine })?.span;
  if (span) {
    show(view, editor.offsetToPos(span.start), editor.offsetToPos(span.end));
  } else if (quote.startLine && quote.startLine <= editor.lineCount()) {
    const at = { line: quote.startLine - 1, ch: 0 };
    show(view, at, at);
    new Notice('The quoted text has changed. Opened where it was.');
  } else {
    new Notice('The quoted text has changed or is gone.');
  }
}

function show(view: MarkdownView, from: EditorPosition, to: EditorPosition): void {
  if (view.getMode() === 'preview') {
    view.previewMode.applyScroll(from.line);
    return;
  }
  view.editor.setSelection(from, to);
  view.editor.scrollIntoView({ from, to }, true);
}
