import { type FileView, MarkdownView } from 'obsidian';

import type { Viewport } from '@/shared/Viewport';

/** The CodeMirror view behind an Obsidian editor; Obsidian types do not expose it. */
interface EditorHandle {
  scrollDOM: HTMLElement;
  posAtCoords(coords: { x: number; y: number }, precise: false): number;
}

/** Where the student is looking in the open document, or undefined when the view has no notion of it. */
export function readViewport(view: FileView): Viewport | undefined {
  if (view instanceof MarkdownView) return view.getMode() === 'preview' ? previewViewport(view) : editorViewport(view);
  return view.getViewType() === 'pdf' ? pdfViewport(view) : undefined;
}

/** CodeMirror's own viewport includes lines above and below the screen, so ask which lines sit at the pane's edges. */
function editorViewport(view: MarkdownView): Viewport | undefined {
  const handle = (view.editor as unknown as { cm?: EditorHandle }).cm;
  if (!handle) return undefined;
  const bounds = handle.scrollDOM.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const lineAt = (y: number): number => view.editor.offsetToPos(handle.posAtCoords({ x, y }, false)).line + 1;
  return { unit: 'lines', from: lineAt(bounds.top + 2), to: lineAt(bounds.bottom - 2) };
}

/** Reading view reports the source line at its top, 0-indexed and fractional, and nothing for the bottom. */
function previewViewport(view: MarkdownView): Viewport | undefined {
  const top = view.previewMode.getScroll();
  return Number.isFinite(top) ? { unit: 'lines', from: Math.floor(top) + 1 } : undefined;
}

function pdfViewport(view: FileView): Viewport | undefined {
  const scroller = view.containerEl.querySelector('.pdf-viewer-container');
  if (!scroller) return undefined;
  const bounds = scroller.getBoundingClientRect();
  const pages = [...view.containerEl.querySelectorAll<HTMLElement>('.page[data-page-number]')]
    .filter((page) => {
      const rect = page.getBoundingClientRect();
      return rect.bottom > bounds.top && rect.top < bounds.bottom;
    })
    .map((page) => Number(page.dataset.pageNumber));
  return pages.length ? { unit: 'pages', from: Math.min(...pages), to: Math.max(...pages) } : undefined;
}
