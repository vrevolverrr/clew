import { parser } from '@lezer/markdown';

import type { ReplySegment } from '@/chat/splitReply';
import { splitReply } from '@/chat/splitReply';
import { OpenUIRenderer } from '@/renderer/openui/OpenUIRenderer';
import { library } from '@/renderer/openui/library';
import { canAnimate } from '@/shared/view/iconButtons';

/** What a reply needs to draw Markdown; the chat pane provides it. `diagrams` also draws its Mermaid fences. */
export interface MarkdownTarget {
  render(el: HTMLElement, markdown: string, options?: { diagrams?: boolean }): Promise<void>;
  release(container?: HTMLElement): void;
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
      const block = this.el.insertBefore(document.createElement('div'), this.tail);
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

type Part =
  | { kind: 'prose'; el: HTMLElement; prose: Prose }
  | { kind: 'mermaid'; el: HTMLElement; drawn: boolean }
  | { kind: 'openui'; el: HTMLElement; renderer: OpenUIRenderer; drawn: boolean; pending: Promise<void>[] };

/**
 * A stretch of reply text: prose through the chat Markdown renderer, each OpenUI fence through its own renderer.
 * A Mermaid or OpenUI fence shows a drawing card until it closes, then draws once in the same card.
 */
export class TextBlock {
  private readonly parts: Part[] = [];
  private source = '';
  private complete = false;
  private frame: number | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly markdown: MarkdownTarget,
    private readonly ask?: (message: string) => boolean,
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
    segments.forEach((segment, index) => {
      let part = this.parts[index];
      if (part?.kind !== segment.kind) {
        this.removeFrom(index);
        part = this.createPart(segment);
        this.parts.push(part);
      }
      if (part.kind === 'openui' && segment.kind === 'openui') {
        // A half-streamed program draws a half-built figure, so the figure waits for its closing fence and draws once.
        if (!part.drawn && (segment.closed || this.complete)) {
          part.drawn = true;
          part.renderer.set(segment.text, true);
          // Markdown inside the figure renders async, so its height is known only once those renders settle.
          void Promise.allSettled(part.pending.splice(0)).then(() => reveal(part.el));
        }
      } else if (part.kind === 'mermaid' && segment.kind === 'mermaid') {
        this.drawDiagram(part, segment.text, segment.closed || this.complete);
      } else if (part.kind === 'prose' && segment.kind === 'prose') {
        part.prose.set(segment.text);
      }
    });
    this.removeFrom(segments.length);
  }

  /** Renders the diagram under the drawing card, which fades once the render settles, so its source never shows. */
  private drawDiagram(part: Extract<Part, { kind: 'mermaid' }>, source: string, closed: boolean): void {
    if (part.drawn || !closed) return;
    part.drawn = true;
    const target = part.el.createDiv({ cls: 'clew-diagram' });
    // A fence longer than any backtick run in the source, so no line of it closes the fence early.
    const fence = '`'.repeat(Math.max(3, ...(source.match(/`+/g) ?? []).map((run) => run.length + 1)));
    void this.markdown.render(target, `${fence}mermaid\n${source}\n${fence}`, { diagrams: true }).finally(() => reveal(part.el));
  }

  private createPart(segment: ReplySegment): Part {
    const el = this.el.createDiv({ cls: `clew-reply-${segment.kind}` });
    if (segment.kind === 'prose') return { kind: 'prose', el, prose: new Prose(el, this.markdown) };
    const drawing = segment.kind === 'mermaid' || !(segment.closed || this.complete);
    if (drawing) el.addClass('is-drawing');
    if (segment.kind === 'mermaid') {
      addDrawingCard(el, 'Drawing diagram');
      return { kind: 'mermaid', el, drawn: false };
    }
    if (drawing) addDrawingCard(el, 'Drawing visual');
    const pending: Promise<void>[] = [];
    const renderMarkdown = (target: HTMLElement, markdown: string) => {
      const render = this.markdown.render(target, markdown, { diagrams: true });
      if (el.hasClass('is-drawing')) pending.push(render);
    };
    const body = el.createDiv({ cls: 'clew-openui-body' });
    return { kind: 'openui', el, renderer: new OpenUIRenderer(body, library, renderMarkdown, this.ask), drawn: false, pending };
  }

  private removeFrom(index: number): void {
    for (const part of this.parts.splice(index)) {
      if (part.kind === 'openui') part.renderer.destroy();
      this.markdown.release(part.el);
      part.el.remove();
    }
  }
}
