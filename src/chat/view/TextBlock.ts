import { parser } from '@lezer/markdown';

import type { ReplySegment } from '@/chat/splitReply';
import { fenceFor, splitReply } from '@/chat/splitReply';
import { LIMITS } from '@/renderer/figure/FigureData';
import { figureSandbox } from '@/renderer/figure/FigureSandbox';
import { type FigureHost, FigureView } from '@/renderer/figure/FigureView';
import { canAnimate } from '@/shared/view/iconButtons';

/** What a reply needs to draw Markdown and maths; the chat pane provides it. `diagrams` also draws its Mermaid fences. */
export interface MarkdownTarget {
  render(el: HTMLElement, markdown: string, options?: { diagrams?: boolean }): Promise<void>;
  release(container?: HTMLElement): void;
  renderMath(tex: string, display: boolean): HTMLElement;
  finishRenderMath(): Promise<void>;
}

/** Grows the card from its drawing height to the diagram's while the drawing card fades out. */
function reveal(frame: HTMLElement): void {
  if (!frame.hasClass('is-drawing')) return;
  const from = frame.offsetHeight;
  const card = frame.querySelector<HTMLElement>('.clew-diagram-card');
  // Keep the fading effect at its loading size while the frame grows to fit the figure.
  if (card) card.style.height = `${card.offsetHeight}px`;
  frame.removeClass('is-drawing');
  if (!card) return;
  if (!canAnimate(frame)) {
    card.remove();
    return;
  }
  frame.animate([{ height: `${from}px` }, { height: `${frame.offsetHeight}px` }], { duration: 320, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
  void card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' }).finished.then(() => card.remove());
}

/** The card a figure shows while its fence streams; `reveal` fades it out. */
function addDrawingCard(frame: HTMLElement, label: string): void {
  const card = frame.createDiv({ cls: 'clew-diagram-card' });
  card.createDiv({ cls: 'clew-diagram-rings' });
  card.createDiv({ cls: 'clew-diagram-stencil' });
  card.createSpan({ cls: 'clew-tools-orb', attr: { 'aria-hidden': 'true' } });
  card.createSpan({ cls: 'clew-diagram-card-label', text: label });
}

/**
 * Markdown prose that renders each finished top-level block once, and re-renders only the last block,
 * the one still being written, so a long reply costs the same per frame as a short one.
 */
class Prose {
  private settled = 0;
  private tail: HTMLElement | null = null;
  private tailText = '';

  constructor(
    readonly el: HTMLElement,
    private readonly markdown: MarkdownTarget,
  ) {}

  set(text: string): void {
    const end = lastBlockStart(text, this.settled);
    if (end > this.settled) {
      const block = this.el.insertBefore(createDiv(), this.tail);
      void this.markdown.render(block, text.slice(this.settled, end));
      this.settled = end;
    }
    const rest = text.slice(this.settled);
    if (rest === this.tailText) return;
    this.tailText = rest;
    this.tail ??= this.el.createDiv();
    void this.markdown.render(this.tail, rest);
  }
}

/**
 * Where the last top-level Markdown block starts, never before `from`. Only a block after a blank line counts:
 * a line right under a paragraph can still change it, as `---` turns it into a heading.
 */
function lastBlockStart(text: string, from: number): number {
  let start = from;
  const cursor = parser.parse(text).cursor();
  if (cursor.firstChild()) {
    do {
      if (cursor.from > start && /\n[ \t]*\n[ \t]*$/.test(text.slice(0, cursor.from))) start = cursor.from;
    } while (cursor.nextSibling());
  }
  return start;
}

/** The figures of one reply, across its text blocks, numbered in order from 0. */
export class ReplyFigures {
  /** One for each figure that has started to run, resolved once it has drawn or failed. */
  readonly outcomes: Promise<void>[] = [];
  /** Failures of a live reply that a repair may fix, by figure number. */
  readonly held = new Map<number, { error: string; showError(): void }>();
  /** Once set, a failure shows its error card at once instead of being held. */
  settled = false;

  /** `live` is false for a saved reply drawn again, which never asks for a repair. `send` sends a Quiz answer. */
  constructor(readonly live: boolean, readonly send?: (message: string) => boolean) {}
}

type Part =
  | { kind: 'prose'; el: HTMLElement; prose: Prose }
  | { kind: 'mermaid'; el: HTMLElement; drawn: boolean }
  /** `view` is absent for a figure past the reply's limit, which shows as code. */
  | { kind: 'figure'; el: HTMLElement; view?: FigureView; drawn: boolean; ordinal: number };

/**
 * A stretch of reply text: prose through the chat Markdown renderer, each figure fence through a `FigureView`.
 * A Mermaid or figure fence shows a drawing card until it closes, then draws once in the same card.
 */
export class TextBlock {
  private readonly parts: Part[] = [];
  private source = '';
  private complete = false;
  private frame: number | null = null;

  /** `first` is the number of this block's first figure in the reply. */
  constructor(
    private readonly el: HTMLElement,
    private readonly markdown: MarkdownTarget,
    private readonly figures: ReplyFigures,
    private readonly first: number,
  ) {}

  /** Renders the text so far, at most once per frame. */
  append(delta: string): void {
    this.source += delta;
    this.frame ??= window.requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  get text(): string {
    return this.source;
  }

  finish(): void {
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.complete = true;
    this.render();
  }

  destroy(): void {
    if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.removeFrom(0);
  }

  private render(): void {
    const segments = splitReply(this.source, this.complete);
    let figures = 0;
    segments.forEach((segment, index) => {
      let part = this.parts[index];
      if (part?.kind !== segment.kind) {
        this.removeFrom(index);
        part = this.createPart(segment, this.first + figures);
        this.parts.push(part);
      }
      if (part.kind === 'figure' && segment.kind === 'figure') {
        figures += 1;
        // A half-written program cannot run, so the figure waits for its closing fence and draws once.
        if (!part.drawn && (segment.closed || this.complete)) {
          part.drawn = true;
          if (part.view) this.figures.outcomes.push(this.drawFigure(part, part.view, segment.text));
          else this.drawAsCode(part, segment.text);
        }
      } else if (part.kind === 'mermaid' && segment.kind === 'mermaid') {
        this.drawDiagram(part, segment.text, segment.closed || this.complete);
      } else if (part.kind === 'prose' && segment.kind === 'prose') {
        part.prose.set(segment.text);
      }
    });
    this.removeFrom(segments.length);
  }

  /** Runs the figure under the drawing card. A live failure a repair may fix keeps the card and is held; any other shows its error card. */
  private async drawFigure(part: Extract<Part, { kind: 'figure' }>, view: FigureView, source: string): Promise<void> {
    const showError = (error: string): void => {
      view.showError(error, source);
      reveal(part.el);
    };
    try {
      const outcome = await view.run(source, { whenVisible: !this.figures.live });
      if (outcome.drawn) return reveal(part.el);
      if (!this.figures.live || !outcome.repairable || this.figures.settled) return showError(outcome.error);
      this.figures.held.set(part.ordinal, { error: outcome.error, showError: () => showError(outcome.error) });
    } catch (error) {
      console.error('Clew: a figure failed to draw', error);
      showError('The figure could not be drawn');
    }
  }

  private drawAsCode(part: Extract<Part, { kind: 'figure' }>, source: string): void {
    const target = part.el.createDiv({ cls: 'clew-figure-code' });
    const fence = fenceFor(source);
    const shown = this.markdown.render(target, `${fence}js\n${source}\n${fence}`);
    target.createDiv({ cls: 'clew-figure-note', text: 'Only four figures are drawn per reply' });
    void shown.finally(() => reveal(part.el));
  }

  /** Renders the diagram under the drawing card, which fades once the render settles, so its source never shows. */
  private drawDiagram(part: Extract<Part, { kind: 'mermaid' }>, source: string, closed: boolean): void {
    if (part.drawn || !closed) return;
    part.drawn = true;
    const target = part.el.createDiv({ cls: 'clew-diagram' });
    const fence = fenceFor(source);
    void this.markdown.render(target, `${fence}mermaid\n${source}\n${fence}`, { diagrams: true }).finally(() => reveal(part.el));
  }

  private createPart(segment: ReplySegment, ordinal: number): Part {
    const el = this.el.createDiv({ cls: `clew-reply-${segment.kind}` });
    if (segment.kind === 'prose') return { kind: 'prose', el, prose: new Prose(el, this.markdown) };
    el.addClass('is-drawing');
    if (segment.kind === 'mermaid') {
      addDrawingCard(el, 'Drawing diagram');
      return { kind: 'mermaid', el, drawn: false };
    }
    addDrawingCard(el, 'Drawing visual');
    if (ordinal >= LIMITS.figuresPerReply) return { kind: 'figure', el, drawn: false, ordinal };
    figureSandbox.warm();
    // A label in a figure is not a diagram, so its fences never draw as Mermaid.
    const host: FigureHost = {
      renderMarkdown: (target, markdown) => this.markdown.render(target, markdown, { diagrams: false }),
      renderMath: (tex, display) => this.markdown.renderMath(tex, display),
      finishRenderMath: () => this.markdown.finishRenderMath(),
      send: this.figures.send,
    };
    return { kind: 'figure', el, view: new FigureView(el, host), drawn: false, ordinal };
  }

  private removeFrom(index: number): void {
    for (const part of this.parts.splice(index)) {
      if (part.kind === 'figure') part.view?.destroy();
      this.markdown.release(part.el);
      part.el.remove();
    }
  }
}
