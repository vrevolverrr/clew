import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { type App, MarkdownView, normalizePath, type TFile } from 'obsidian';

import type { TourStep } from '@/chat/ChatRecord';
import type { TourStage } from '@/tour/HighlightTour';
import { findQuote, inCallout } from '@/tour/locateQuote';
import { type Anchor, inBand } from '@/tour/placeCard';
import { addMark, clearMarks } from '@/tour/obsidian/highlightMarks';
import { renderedQuote } from '@/tour/obsidian/renderedQuote';
import { TourOverlay } from '@/tour/view/TourOverlay';
import { leafOfFile } from '@/shared/obsidian/leafOfFile';
import { readViewport } from '@/shared/obsidian/viewport';

const NAME = 'clew-highlight';
// Reading view draws a section when it scrolls near, so a quote far down may take a moment to exist.
const DRAW_TRIES = 6;
const DRAW_MS = 50;
const INTERRUPTS = ['wheel', 'keydown', 'pointerdown'] as const;
// The last mark stays this long after the tour ends, so the student can finish reading the sentence.
const LINGER_MS = 3000;
/** Where the cursor points, in window coordinates; null while the text is not drawn. */
type Target = () => Anchor | null;

/**
 * The stage of a tour on the student's notes: opens the note in a tab if it is not open, marks the quote in either
 * view (one mark at a time), scrolls to it only if it is not already comfortably on screen, and has the cursor and comment card point at it.
 */
export class NoteHighlights implements TourStage {
  private readonly overlay: TourOverlay;
  /** The editors that hold a mark, so clearing touches only them. */
  private readonly marked = new Set<EditorView>();
  private watching: (() => void) | null = null;
  private fade = 0;

  /** `controls.stop` runs when the student takes over by scrolling, clicking or typing in the note being pointed at, or by pressing Escape. */
  constructor(private readonly app: App, private readonly controls: { stop(): void; hold(held: boolean): void }) {
    this.overlay = new TourOverlay(document.body, (held) => controls.hold(held));
  }

  /** Never rejects for a quote that is not there: that step is dropped and the tour moves on. */
  async show({ path, quote, comment, line }: TourStep, signal: AbortSignal): Promise<boolean> {
    window.clearTimeout(this.fade);
    this.unmark();
    const file = this.noteAt(path);
    if (!file) return this.drop(quote, `no note ${path}`);
    const view = await this.viewOf(file);
    if (!view || signal.aborted) return false;
    const hit = findQuote(view.editor.getValue(), quote, { line: line ?? readViewport(view)?.from, wholeWords: true });
    const target = view.getMode() === 'preview' ? await this.markPreview(view, quote, hit, signal) : await this.markEditor(view, quote, hit?.span, signal);
    if (!target) return signal.aborted ? false : this.drop(quote, `not in ${path}`);
    this.watch(view);
    this.overlay.show(target, view.contentEl, comment);
    return true;
  }

  timing(ms: number): void {
    this.overlay.setTiming(ms);
  }

  /** Hides the cursor and card; the mark goes a moment later. */
  rest(): void {
    this.watching?.();
    this.overlay.hide();
    window.clearTimeout(this.fade);
    this.fade = window.setTimeout(() => this.unmark(), LINGER_MS);
  }

  clear(): void {
    this.rest();
    window.clearTimeout(this.fade);
    this.unmark();
  }

  private unmark(): void {
    CSS.highlights.delete(NAME);
    for (const cm of this.marked) cm.dispatch({ effects: clearMarks.of(null) });
    this.marked.clear();
  }

  destroy(): void {
    this.clear();
    this.overlay.destroy();
  }

  private drop(quote: string, why: string): false {
    console.debug(`Clew: dropped a highlight of "${quote}": ${why}`);
    return false;
  }

  /** The Markdown note a model's path names. A model may leave off the folder or the extension, so links' own lookup is the fallback. */
  private noteAt(path: string): TFile | null {
    const { vault, metadataCache } = this.app;
    const file = vault.getFileByPath(normalizePath(path)) ?? metadataCache.getFirstLinkpathDest(path, '');
    return file?.extension === 'md' ? file : null;
  }

  /** The tab showing the note, brought forward without taking focus from the chat; a tab is opened when none shows it. */
  private async viewOf(file: TFile): Promise<MarkdownView | undefined> {
    const { workspace } = this.app;
    const open = leafOfFile(this.app, file);
    const leaf = open ?? workspace.getLeaf('tab');
    if (open) await open.loadIfDeferred();
    else await leaf.openFile(file, { active: false });
    workspace.setActiveLeaf(leaf, { focus: false });
    return leaf.view instanceof MarkdownView ? leaf.view : undefined;
  }

  private editorOf(view: MarkdownView): EditorView | undefined {
    return (view.editor as unknown as { cm?: EditorView }).cm;
  }

  private async markEditor(view: MarkdownView, quote: string, span: { start: number; end: number } | undefined, signal: AbortSignal): Promise<Target | null> {
    const cm = this.editorOf(view);
    if (!span || !cm || signal.aborted) return null;
    const at = cm.coordsAtPos(span.start);
    const pane = cm.scrollDOM.getBoundingClientRect();
    this.marked.add(cm);
    cm.dispatch({
      effects: [addMark.of({ from: span.start, to: span.end }), ...(at && inBand(at, pane) ? [] : [EditorView.scrollIntoView(EditorSelection.cursor(span.start), { y: 'center' })])],
    });
    // Live Preview draws a callout as a widget that replaces its lines, so an editor mark inside it never shows.
    if (!view.getState().source && inCallout(view.editor.getValue(), span.start)) {
      const range = await this.calloutQuote(cm, span.start, quote);
      if (signal.aborted) return null;
      if (range) {
        CSS.highlights.set(NAME, new Highlight(range));
        return this.rangeTarget(range);
      }
    }
    return () => {
      const end = cm.coordsAtPos(span.end, -1);
      return end ? { x: end.right, y: end.bottom, top: end.top } : null;
    };
  }

  /** Where `quote` is drawn in the callout widget that stands for the source at `pos`, once the editor has drawn it. */
  private async calloutQuote(cm: EditorView, pos: number, quote: string): Promise<Range | undefined> {
    for (let tries = 0; tries <= DRAW_TRIES; tries++) {
      // A replaced range reports the box of the widget that stands for it.
      const at = cm.coordsAtPos(pos);
      const widget = at && [...cm.contentDOM.querySelectorAll<HTMLElement>('.cm-callout')].find((el) => {
        const box = el.getBoundingClientRect();
        return at.top >= box.top - 1 && at.top <= box.bottom + 1;
      });
      if (widget) return renderedQuote(widget, quote)[0];
      await new Promise((resolve) => window.setTimeout(resolve, DRAW_MS));
    }
    return undefined;
  }

  private rangeTarget(range: Range): Target {
    return () => {
      const rects = range.getClientRects();
      const last = rects[rects.length - 1];
      return last ? { x: last.right, y: last.bottom, top: last.top } : null;
    };
  }

  /**
   * Reading view has no source offsets, so the quote is searched in the page as drawn. When the source shows the
   * quote more than once, or the page does not hold it yet, the view scrolls to the source line first.
   */
  private async markPreview(view: MarkdownView, quote: string, hit: ReturnType<typeof findQuote>, signal: AbortSignal): Promise<Target | null> {
    const root = view.previewMode.containerEl;
    let ranges = renderedQuote(root, quote);
    if (hit && (hit.count > 1 || ranges.length !== 1)) {
      view.previewMode.applyScroll(view.editor.offsetToPos(hit.span.start).line);
      ranges = await this.drawn(root, quote);
    }
    const top = root.getBoundingClientRect().top;
    const distances = new Map(ranges.map((range) => [range, Math.abs(range.getBoundingClientRect().top - top)]));
    const range = ranges.reduce<Range | undefined>((best, next) => (!best || distances.get(next)! < distances.get(best)! ? next : best), undefined);
    if (!range || signal.aborted) return null;
    if (!inBand(range.getBoundingClientRect(), root.getBoundingClientRect())) range.startContainer.parentElement?.scrollIntoView({ block: 'center' });
    CSS.highlights.set(NAME, new Highlight(range));
    return this.rangeTarget(range);
  }

  private async drawn(root: HTMLElement, quote: string): Promise<Range[]> {
    for (let tries = 0; ; tries++) {
      const ranges = renderedQuote(root, quote);
      if (ranges.length || tries === DRAW_TRIES) return ranges;
      await new Promise((resolve) => window.setTimeout(resolve, DRAW_MS));
    }
  }

  /** The tour yields to the student: any scroll, click or key in the pane it points into ends it. */
  private watch(view: MarkdownView): void {
    this.watching?.();
    const interrupt = (event: Event): void => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') this.controls.stop();
      else if (event.target instanceof Node && view.contentEl.contains(event.target)) this.controls.stop();
    };
    for (const name of INTERRUPTS) document.addEventListener(name, interrupt, { capture: true, passive: true });
    this.watching = () => {
      for (const name of INTERRUPTS) document.removeEventListener(name, interrupt, { capture: true });
      this.watching = null;
    };
  }
}
