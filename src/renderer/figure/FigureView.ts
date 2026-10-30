import { div } from '@/renderer/figure/dom';
import { diagramExtent, drawDiagram, type Extent, type Room, widen } from '@/renderer/figure/drawDiagram';
import { drawGraph, layoutGraph } from '@/renderer/figure/drawGraph';
import { drawLinks, type Link, POINTER_STEP, pointerLabel } from '@/renderer/figure/drawLinks';
import { drawParams } from '@/renderer/figure/drawParams';
import { plotModel } from '@/renderer/figure/drawPlot';
import { drawQuiz } from '@/renderer/figure/drawQuiz';
import { type FigureData, type FigureNode, type Param, TAGS, type Tag } from '@/renderer/figure/FigureData';
import { figureSandbox, type FigureSandbox } from '@/renderer/figure/FigureSandbox';
import { drawTex, drawTexIn, mapMath, type Rgb, type TagColour, texAnchors, texTags, TYPESET_MATH } from '@/renderer/figure/figureTex';
import { figureText } from '@/renderer/figure/figureText';
import { formatFigure } from '@/renderer/figure/formatFigure';
import { status } from '@/renderer/figure/geometry';
import type { NetworkLayout } from '@/renderer/figure/network/layoutNetwork';
import { Playback } from '@/renderer/figure/Playback';
import { PlotChart } from '@/renderer/figure/plot/PlotChart';
import { StepList } from '@/renderer/figure/StepList';
import { validateFigure } from '@/renderer/figure/validateFigure';

export interface FigureHost {
  /** Renders Markdown into `el` with the chat's renderer; strings pass through `figureText` first. Resolves once MathJax has finished. */
  renderMarkdown(el: HTMLElement, markdown: string): Promise<void>;
  /** Draws TeX with MathJax at once; a glyph MathJax has not used before shows once `finishRenderMath` resolves. */
  renderMath(tex: string, display: boolean): HTMLElement;
  finishRenderMath(): Promise<void>;
  /** Sends a Quiz answer as the student's next message; false when the chat cannot take one now. */
  send?(message: string): boolean;
}

export type FigureOutcome = { drawn: true } | { drawn: false; error: string; repairable: boolean };

/** How long Play shows each step: long enough to read its caption. */
const STEP_MS = 2000;

/** How long a resize must rest before hidden steps repaint at the new width. */
const SETTLE_MS = 150;

/** The most steps listed beside a figure; more show one caption at a time. */
const MAX_LISTED = 6;

/** The tags the key explains: ▶, ✓ and green or red say what they mean, these three do not. */
const MEANING: Partial<Record<Tag, string>> = {
  match: 'a found or equal pair',
  new: 'just added or changed',
  dim: 'out of play',
};
const FALLBACK_WIDTH = 480;
const RENDERED_LIMIT = 500;
/** No character Markdown or TeX would read, and no list or quote marker: shown as text, with no render. */
const isPlain = (text: string): boolean => !/[*_`$\\[\]<>#|~!&]/.test(text) && !/^\s*([-+>]|\d+[.)])\s/.test(text);
/** Plain text and `$…$` maths only, which MathJax draws at once with no Markdown render to wait for; else undefined. */
function mathParts(markdown: string): (string | { tex: string; display: boolean })[] | undefined {
  const parts: (string | { tex: string; display: boolean })[] = [];
  let plain = true;
  mapMath(markdown, (math) => {
    const display = math.startsWith('$$');
    parts.push({ tex: display ? math.slice(2, -2) : math.slice(1, -1), display });
    return '';
  }, (text) => {
    plain &&= isPlain(text);
    parts.push(text);
    return '';
  }, TYPESET_MATH);
  return plain ? parts : undefined;
}
/** Runs per param when fitting a Diagram's frame to its range. */
const RANGE_SAMPLES = 12;
/** A param's values to fit a Diagram's frame to: every choice, a slider's ends and evenly spaced steps between. */
function rangeOf(param: Param): unknown[] {
  if (param.kind === 'choice') return [...param.options];
  if (param.kind === 'text') return [];
  const steps = Math.floor((param.max - param.min) / param.step);
  const count = Math.min(steps + 1, RANGE_SAMPLES);
  return Array.from({ length: count }, (_, i) => param.min + Math.round((i * steps) / Math.max(1, count - 1)) * param.step);
}
/** The px size of a Graph's text, as `styles.css` sets it. */
const GRAPH_FONT = 13;

/** One step's drawing, and what must be repainted when the figure's width changes. */
interface StepView {
  el: HTMLElement;
  links: Link[];
  plots: PlotChart[];
  diagrams: (() => void)[];
  dirty: boolean;
}

/** The pointers one Seq, Table or Tex holds in its busiest step, the longest name's length, and every step's names. */
type Lane = { count: number; name: number; names: (string | number)[] };

/** What drawing one figure needs, shared by its steps. */
interface Drawing {
  markdown: (el: HTMLElement, text: string | number) => void;
  tex: (el: HTMLElement, tex: string) => void;
  graphs: Map<string, NetworkLayout>;
  extents: Map<string, Extent>;
  lanes: Map<string, Lane>;
  used: Set<Tag>;
}

const live = new Set<FigureView>();
let themeObserver: MutationObserver | undefined;
let dark = false;

/** Obsidian switches themes by the body's class; every live figure redraws its TeX colours then. */
function watchTheme(view: FigureView): void {
  live.add(view);
  if (themeObserver || typeof MutationObserver === 'undefined') return;
  dark = document.body.classList.contains('theme-dark');
  themeObserver = new MutationObserver(() => {
    const now = document.body.classList.contains('theme-dark');
    if (now === dark) return;
    dark = now;
    for (const figure of live) figure.retheme();
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

/** `rgb(…)`, `rgba(…)` or `color(srgb …)` as 0–255 integers; grey when the colour cannot be read. */
function parseColour(text: string): Rgb {
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(text);
  if (srgb) return [1, 2, 3].map((i) => Math.round(Number(srgb[i]) * 255)) as unknown as Rgb;
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  return rgb ? ([1, 2, 3].map((i) => Math.round(Number(rgb[i]))) as unknown as Rgb) : [128, 128, 128];
}

/** A Graph's or Diagram's key across steps: its id, else its place among the step's elements of its type. */
const nodeKey = (node: { id?: string }, ordinal: number): string => node.id ?? `#${ordinal}`;

/** Every element of a step's tree in drawing order; layers are not visited. */
function walk(node: FigureNode, visit: (node: FigureNode) => void): void {
  visit(node);
  if ('children' in node && (node.type === 'Row' || node.type === 'Column' || node.type === 'Panel')) node.children.forEach((child) => walk(child, visit));
}

/** Runs one figure program in the sandbox, validates what it returns and draws it: every step at once in one grid cell, the current one shown. */
export class FigureView {
  readonly el: HTMLElement;
  private readonly controller = new AbortController();
  private readonly observer?: ResizeObserver;
  private readonly values = new Map<string, unknown>();
  private source = '';
  private figure?: FigureData;
  private current = 0;
  private generation = 0;
  private steps: StepView[] = [];
  private playback?: Playback;
  private narrate?: (index: number) => void;
  private placeSide?: () => void;
  private settle?: number;
  private params?: HTMLElement;
  private paramError?: HTMLElement;
  private body?: HTMLElement;
  private rerunning = false;
  private again = false;
  private width = 0;
  private readonly colours = new Map<string, Rgb>();
  /** What each Markdown string rendered to, so a redraw that shows it again copies it instead of typesetting it again. */
  private readonly rendered = new Map<string, DocumentFragment>();
  /** Each Diagram's extent, kept across redraws so it stays anchored as params change. */
  private readonly extents = new Map<string, Extent>();
  /** Per Diagram, the most room past its border any step needs, and every step's paint with its step, so all steps keep one frame. */
  private readonly rooms = new Map<string, { room: Room; paints: Map<() => void, StepView> }>();
  /** Each sent Quiz answer, so a redraw keeps the Quiz answered. */
  private readonly answers = new Map<string, number>();
  /** The shown drawing's Markdown, for links redrawn after a resize. */
  private markdown?: Drawing['markdown'];

  constructor(parent: HTMLElement, private readonly host: FigureHost, private readonly sandbox: FigureSandbox = figureSandbox) {
    this.el = parent.appendChild(div('clew-figure'));
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resized());
      this.observer.observe(this.el);
    }
    watchTheme(this);
  }

  /**
   * Runs the program with its declared defaults, validates and draws it; does not show errors. `whenVisible` waits
   * until the figure is near the screen, so reopening a long chat runs only what the student can reach.
   */
  async run(source: string, { whenVisible = false } = {}): Promise<FigureOutcome> {
    this.source = source;
    if (whenVisible) await this.visible();
    const result = await this.execute();
    if (!result.ok) return { drawn: false, error: result.error, repairable: result.repairable };
    await this.draw(result.figure, false);
    void this.fitRange(result.figure);
    return { drawn: true };
  }

  /** Replaces the figure with the error card: the sentence, and the source collapsed under it. */
  showError(error: string, source: string): void {
    this.clear();
    this.params = undefined;
    const card = this.el.appendChild(div('clew-figure-error'));
    card.setAttribute('role', 'note');
    card.appendChild(div('clew-figure-error-message')).textContent = error;
    const details = card.appendChild(createEl('details'));
    details.appendChild(createEl('summary')).textContent = 'Figure source';
    details.appendChild(createEl('pre')).appendChild(createEl('code')).textContent = source;
  }

  destroy(): void {
    this.controller.abort();
    window.clearTimeout(this.settle);
    this.observer?.disconnect();
    live.delete(this);
    // The last figure going (a closed chat, the plugin unloading) stops the watch, so a reload does not leave one behind.
    if (!live.size) {
      themeObserver?.disconnect();
      themeObserver = undefined;
    }
    this.clear();
  }

  /** Redraws with the theme's tag colours, which figure TeX holds as literals. */
  retheme(): void {
    this.colours.clear();
    if (this.figure && this.body?.isConnected) void this.draw(this.figure, true);
  }

  /** `background` runs queue behind every figure on screen and every run the student asked for. */
  private async execute(params = Object.fromEntries(this.values), background = false): Promise<{ ok: true; figure: FigureData } | { ok: false; error: string; repairable: boolean }> {
    // A figure in a hidden tab has no box; it waits behind every figure on screen.
    const near = (): number => {
      const box = this.el.getBoundingClientRect();
      return box.width === 0 ? Infinity : background ? Number.MAX_SAFE_INTEGER : Math.abs(box.top);
    };
    const result = await this.sandbox.run(this.source, params, near, this.controller.signal);
    if (!result.ok) return { ok: false, error: result.line ? `${result.error} (line ${result.line})` : result.error, repairable: result.repairable };
    const valid = validateFigure(result.payload);
    return valid.ok ? { ok: true, figure: valid.figure } : { ok: false, error: valid.error, repairable: true };
  }

  /** Resolves once the figure is within a screen of the viewport, or at once where that cannot be watched. */
  private visible(): Promise<void> {
    if (typeof IntersectionObserver === 'undefined') return Promise.resolve();
    return new Promise((resolve) => {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting) && !this.controller.signal.aborted) return;
        observer.disconnect();
        resolve();
      }, { rootMargin: '100% 0px' });
      observer.observe(this.el);
      this.controller.signal.addEventListener('abort', () => {
        observer.disconnect();
        resolve();
      });
    });
  }

  /** `typeset` is told when MathJax drew here at once, so its new glyphs are measured again once they show. */
  private render(el: HTMLElement, markdown: string, renders: Promise<unknown>[], typeset: () => void): void {
    const done = this.rendered.get(markdown);
    if (done) {
      el.replaceChildren(done.cloneNode(true));
      return;
    }
    const remember = (): void => {
      if (this.rendered.size >= RENDERED_LIMIT) this.rendered.clear();
      const copy = createFragment();
      for (const node of el.childNodes) copy.append(node.cloneNode(true));
      this.rendered.set(markdown, copy);
    };
    const parts = mathParts(markdown);
    if (parts) {
      try {
        el.replaceChildren(...parts.map((part) => (typeof part === 'string' ? part : this.host.renderMath(part.tex, part.display))));
        typeset();
        remember();
        return;
      } catch {
        // MathJax is not loaded yet; the Markdown render loads it.
      }
    }
    renders.push(this.host.renderMarkdown(el, markdown).then(remember));
  }

  /**
   * Runs the program across each param's range, so each Diagram's extent holds every value the student can pick and
   * its frame never moves as they pick one. Redraws if that grew an extent.
   */
  private async fitRange(figure: FigureData): Promise<void> {
    let diagrams = false;
    for (const step of figure.steps) walk(step.root, (node) => (diagrams ||= node.type === 'Diagram'));
    if (!diagrams) return;
    const before = JSON.stringify([...this.extents]);
    const runs = figure.params.flatMap((param) => rangeOf(param).map((value) => this.execute({ ...Object.fromEntries(this.values), [param.key]: value }, true)));
    for (const result of await Promise.all(runs)) if (result.ok) this.diagramExtents(result.figure);
    if (this.controller.signal.aborted || JSON.stringify([...this.extents]) === before) return;
    if (!this.rerunning && this.figure && this.body?.isConnected) void this.draw(this.figure, true);
  }

  /** A param changed: one run in flight per figure, and the latest value wins. */
  private async rerun(): Promise<void> {
    if (this.rerunning) {
      this.again = true;
      return;
    }
    this.rerunning = true;
    try {
      do {
        this.again = false;
        const result = await this.execute();
        if (this.controller.signal.aborted) return;
        if (this.again) continue;
        if (this.paramError) this.paramError.textContent = result.ok ? '' : result.error;
        if (result.ok) await this.draw(result.figure, result.figure.steps.length === this.figure?.steps.length);
      } while (this.again);
    } finally {
      this.rerunning = false;
    }
  }

  private clear(): void {
    this.generation += 1;
    this.rooms.clear();
    this.playback?.stop();
    for (const step of this.steps) for (const plot of step.plots) plot.destroy();
    this.steps = [];
    this.body = undefined;
    this.el.replaceChildren();
  }

  /**
   * Draws `figure`. A redraw (a param change, a theme change) builds the new drawing hidden beside the one on screen
   * and swaps them once its renders have finished, so the figure never blanks or jumps while it redraws.
   */
  private async draw(figure: FigureData, keepStep: boolean): Promise<void> {
    const generation = (this.generation += 1);
    // The room each Diagram keeps carries over, so a redraw does not move it; the paints are this drawing's.
    for (const shared of this.rooms.values()) shared.paints.clear();
    const shown = this.body?.isConnected ? this.body : undefined;
    if (!shown) this.el.replaceChildren();
    const renders: Promise<unknown>[] = [];
    let typeset = false;
    const typed = (): void => {
      typeset = true;
    };
    const used = new Set<Tag>();
    const colour: TagColour = (tag, fill) => this.colour(tag, fill);
    const drawing: Drawing = {
      markdown: (el, text) => {
        if (typeof text === 'number' || isPlain(text)) {
          el.textContent = typeof text === 'number' ? formatFigure(text) : text;
          return;
        }
        for (const tag of texTags(text)) used.add(tag);
        this.render(el, figureText(drawTexIn(text, colour)), renders, typed);
      },
      tex: (el, tex) => {
        for (const tag of texTags(tex)) used.add(tag);
        this.render(el, figureText(`$$\n${drawTex(tex, colour)}\n$$`), renders, typed);
      },
      graphs: this.layoutGraphs(figure),
      lanes: this.pointerLanes(figure),
      extents: this.diagramExtents(figure),
      used,
    };

    if (figure.params.length && !this.params?.isConnected) {
      this.params = this.el.appendChild(div('clew-figure-params'));
      drawParams(this.params, figure.params, this.values, (key, value) => {
        this.values.set(key, value);
        void this.rerun();
      });
      this.paramError = this.el.appendChild(div('clew-figure-param-error'));
    }
    const body = this.el.appendChild(div('clew-figure-body'));
    if (shown) body.classList.add('is-pending');
    if (figure.title) drawing.markdown(body.appendChild(div('clew-figure-title')), figure.title);
    const main = body.appendChild(div('clew-figure-main'));
    const scroll = main.appendChild(div('clew-figure-scroll'));
    const stack = scroll.appendChild(div('clew-figure-stack'));
    this.width = this.canvasWidth();
    const steps = figure.steps.map((step) => {
      const view: StepView = { el: stack.appendChild(div('clew-figure-step')), links: [], plots: [], diagrams: [], dirty: false };
      const tags = new Map<string, Tag>();
      walk(step.root, (node) => {
        if ('tags' in node) for (const [id, tag] of node.tags) tags.set(id, tag);
      });
      walk(step.root, (node) => {
        if ('id' in node && node.id && 'tag' in node && node.tag) tags.set(node.id, node.tag);
      });
      const tagOf = (id: string): Tag | undefined => {
        const tag = tags.get(id);
        if (tag) used.add(tag);
        return tag;
      };
      this.drawNode(step.root, view.el, view, drawing, tagOf, new Map());
      return view;
    });

    const side = main.appendChild(div('clew-figure-side'));
    let playback: Playback | undefined;
    const listed = figure.steps.length > 1 && figure.steps.length <= MAX_LISTED;
    let narrate: ((index: number) => void) | undefined;
    let placeSide: (() => void) | undefined;
    if (figure.steps.some((step) => step.caption || step.heading)) {
      const list = new StepList(figure.steps, (el, text) => drawing.markdown(el, text), (index) => {
        this.playback?.stop();
        this.show(index);
      });
      list.single = !listed;
      side.append(list.el);
      narrate = (index) => list.show(index);
      // Under the drawing, a list would push the current step out of view; one caption with the full player stays beside it.
      // A wrapped side column starts at the drawing's left edge, whatever its height.
      if (listed) {
        placeSide = () => {
          // Measured without `is-under`, whose full-width basis would keep the column wrapped once the pane widens again.
          side.classList.remove('is-under');
          const under = side.offsetLeft <= scroll.offsetLeft + 1;
          side.classList.toggle('is-under', under);
          list.single = under;
          playback?.el.classList.toggle('is-play-only', !under);
        };
      }
    }
    const explained = TAGS.filter((tag) => used.has(tag) && MEANING[tag]);
    if (explained.length) {
      const key = scroll.appendChild(div('clew-figure-key'));
      for (const tag of explained) {
        const item = key.appendChild(div('clew-figure-key-item'));
        const mark = item.appendChild(createSpan());
        mark.className = 'clew-figure-key-mark';
        mark.dataset.tag = tag;
        mark.textContent = ' ';
        item.append(`${tag}: ${MEANING[tag]}`);
      }
    }
    if (figure.steps.length > 1) {
      playback = new Playback((index) => this.show(index));
      // The list already shows where the student is and moves on a click, so the player keeps only Play.
      playback.el.classList.toggle('is-play-only', listed);
      side.append(playback.el);
    }
    side.classList.toggle('is-player', figure.steps.length > 1 && !listed);

    this.fitGraphs(body);

    const commit = (): void => {
      this.playback?.stop();
      for (const step of this.steps) for (const plot of step.plots) plot.destroy();
      shown?.remove();
      body.classList.remove('is-pending');
      this.figure = figure;
      this.steps = steps;
      this.narrate = narrate;
      this.placeSide = placeSide;
      this.playback = playback;
      this.body = body;
      this.markdown = drawing.markdown;
      this.show(keepStep ? Math.min(this.current, figure.steps.length - 1) : 0);
    };
    if (!shown) commit();

    // Links and reserved widths need every box measured, so they wait for each Markdown and MathJax render.
    await Promise.allSettled(renders);
    if (generation !== this.generation) {
      if (body !== this.body) {
        body.remove();
        playback?.stop();
        for (const step of steps) for (const plot of step.plots) plot.destroy();
      }
      return;
    }
    if (shown) commit();
    // Diagram labels drawn while their render ran were placed from an estimate.
    const settled = renders.length;
    this.remeasure(drawing.markdown, renders.length > 0);
    // Links are placed again once the fonts load and once their own labels, rendered as the links were drawn, have finished:
    // a rendered label is copied, so this second draw measures it whole.
    void Promise.allSettled([...renders.slice(settled), document.fonts?.ready]).then(() => {
      if (generation === this.generation) for (const step of this.steps) drawLinks(step.el, step.links, drawing.markdown);
    });
    if (typeset) {
      void this.host.finishRenderMath().then(() => {
        if (generation === this.generation) this.remeasure(drawing.markdown, true);
      });
    }
  }

  /** Places what depends on measured boxes again: reserved widths, links, and with `diagrams` every step's Diagram labels. */
  private remeasure(markdown: Drawing['markdown'], diagrams: boolean): void {
    if (diagrams) {
      // Hidden steps are laid out too, so every label is measured now and no step grows the room when it is first shown.
      for (const step of this.steps) step.diagrams.forEach((paint) => paint());
      for (const step of this.steps) if (step.dirty) this.repaint(step);
    }
    this.reserveWidths();
    for (const step of this.steps) drawLinks(step.el, step.links, markdown);
    this.placeSide?.();
  }

  private show(index: number): void {
    this.current = index;
    this.steps.forEach((step, k) => step.el.classList.toggle('is-current', k === index));
    const step = this.steps[index];
    if (step?.dirty) this.repaint(step);
    this.narrate?.(index);
    this.playback?.update(this.steps.length - 1, index, { ms: STEP_MS, offset: 1 });
  }

  private resized(): void {
    const width = this.canvasWidth();
    if (!this.steps.length || width === this.width) return;
    this.width = width;
    this.placeSide?.();
    if (this.body) this.fitGraphs(this.body);
    this.steps.forEach((step, k) => {
      if (k === this.current) this.repaint(step);
      else step.dirty = true;
    });
    // Hidden steps share the grid cell, so their old widths would keep the figure as wide as before; they repaint once the resize settles.
    window.clearTimeout(this.settle);
    this.settle = window.setTimeout(() => {
      if (!this.controller.signal.aborted) for (const step of this.steps) if (step.dirty) this.repaint(step);
    }, SETTLE_MS);
  }

  private repaint(step: StepView): void {
    step.dirty = false;
    for (const plot of step.plots) {
      plot.el.style.width = `${this.width}px`;
      plot.repaint();
    }
    for (const diagram of step.diagrams) diagram();
    if (this.markdown) drawLinks(step.el, step.links, this.markdown);
  }

  /** A Graph wider than the pane shrinks to fit, down to 9 px text; past that it scrolls. */
  private fitGraphs(root: HTMLElement): void {
    for (const graph of root.querySelectorAll<HTMLElement>('.clew-figure-graph')) {
      graph.style.zoom = String(Math.min(1, Math.max(9 / GRAPH_FONT, this.width / parseFloat(graph.style.width))));
    }
  }

  /** The width a Plot, Graph or Diagram draws at: the pane's, less the padding and border of the card around it. */
  private canvasWidth(): number {
    const probe = this.el.appendChild(div('clew-figure-canvas'));
    const style = getComputedStyle(probe);
    const inset = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    probe.remove();
    return (Math.floor(this.el.clientWidth) || FALLBACK_WIDTH) - (inset || 0);
  }

  /** A tag's theme colour, ink or fill, read from a probe element: the custom property's own text is not a colour. */
  private colour(tag: Tag, fill: boolean): Rgb {
    const name = `--clew-figure-${fill ? 'fill' : 'tag'}-${tag}`;
    let rgb = this.colours.get(name);
    if (!rgb) {
      const probe = this.el.appendChild(div('clew-figure-probe'));
      probe.style.color = `var(${name})`;
      rgb = parseColour(getComputedStyle(probe).color);
      probe.remove();
      this.colours.set(name, rgb);
    }
    return rgb;
  }

  /** Each Graph laid out once over every step it is in (by id, else by its place in the step). */
  private layoutGraphs(figure: FigureData): Map<string, NetworkLayout> {
    const uses = new Map<string, Extract<FigureNode, { type: 'Graph' }>[]>();
    for (const step of figure.steps) {
      let ordinal = 0;
      walk(step.root, (node) => {
        if (node.type !== 'Graph') return;
        const key = nodeKey(node, ordinal++);
        uses.set(key, [...(uses.get(key) ?? []), node]);
      });
    }
    return new Map([...uses].map(([key, graphs]) => [key, layoutGraph(graphs)]));
  }

  /** Each Diagram's extent over every step, and over the figure's earlier draws (by id, else by its place in the step). */
  private diagramExtents(figure: FigureData): Map<string, Extent> {
    for (const step of figure.steps) {
      let ordinal = 0;
      walk(step.root, (node) => {
        if (node.type !== 'Diagram') return;
        const key = nodeKey(node, ordinal++);
        this.extents.set(key, diagramExtent(node, this.extents.get(key)));
      });
    }
    return this.extents;
  }

  /** Room each Seq (below), Table (left) and Tex (right) keeps for its pointers, over every step. */
  private pointerLanes(figure: FigureData): Map<string, Lane> {
    const lanes = new Map<string, Lane>();
    for (const step of figure.steps) {
      const owner = new Map<string, string>();
      const counts = new Map<string, number>();
      const ordinals = new Map<string, number>();
      walk(step.root, (node) => {
        if (node.type !== 'Seq' && node.type !== 'Table' && node.type !== 'Tex') return;
        const n = ordinals.get(node.type) ?? 0;
        ordinals.set(node.type, n + 1);
        const key = laneKey(node, n);
        if (node.type === 'Seq') for (const item of node.items) owner.set(item.id, key);
        if (node.type === 'Table') for (const row of node.rowIds) for (let c = -1; c < node.columns.length; c += 1) owner.set(c < 0 ? row : `${row}.${c}`, key);
        if (node.type === 'Tex') for (const id of [node.id, ...texAnchors(node.tex)]) if (id) owner.set(id, key);
      });
      walk(step.root, (node) => {
        if (node.type !== 'Pointer' || !owner.has(node.to)) return;
        const key = owner.get(node.to)!;
        const count = (counts.get(node.to) ?? 0) + 1;
        counts.set(node.to, count);
        const lane = lanes.get(key) ?? { count: 0, name: 0, names: [] };
        const names = lane.names.includes(node.name) ? lane.names : [...lane.names, node.name];
        lanes.set(key, { count: Math.max(lane.count, count), name: Math.max(lane.name, formatFigure(node.name).length), names });
      });
    }
    return lanes;
  }

  /** After the first draw, each id keeps its widest box over the steps, so nothing jitters while stepping. */
  private reserveWidths(): void {
    const widest = new Map<string, number>();
    const boxes: [string, HTMLElement][] = [];
    for (const step of this.steps) {
      for (const el of step.el.querySelectorAll<HTMLElement>('[data-figure-id]')) {
        if (!(el.instanceOf(HTMLElement)) || el.tagName === 'TR' || el.closest('.clew-figure-graph, .clew-figure-plot, .clew-figure-diagram, mjx-container')) continue;
        const id = el.dataset.figureId!;
        const width = el.getBoundingClientRect().width;
        if (!width) continue;
        boxes.push([id, el]);
        widest.set(id, Math.max(widest.get(id) ?? 0, width));
      }
    }
    for (const [id, el] of boxes) el.style.minWidth = `${widest.get(id)}px`;
  }

  /** `counts` numbers the step's Graphs, Seqs, Tables and Texs in drawing order, which keys those without an id. */
  private drawNode(node: FigureNode, parent: HTMLElement, view: StepView, drawing: Drawing, tagOf: (id: string) => Tag | undefined, counts: Map<string, number>): void {
    const ordinal = (): number => {
      const n = counts.get(node.type) ?? 0;
      counts.set(node.type, n + 1);
      return n;
    };
    const mark = <T extends HTMLElement>(el: T, id: string | undefined, tag?: Tag): T => {
      if (id) el.dataset.figureId = id;
      const shown = tag ?? (id ? tagOf(id) : undefined);
      if (shown) {
        el.dataset.tag = shown;
        drawing.used.add(shown);
      }
      return el;
    };
    const child = (cls: string, into: HTMLElement = parent): HTMLElement => into.appendChild(div(cls));
    switch (node.type) {
      case 'Row':
      case 'Column': {
        const el = mark(child(`clew-figure-${node.type.toLowerCase()} is-gap-${node.gap ?? 'md'} is-align-${node.align ?? 'start'}`), node.id);
        for (const item of node.children) this.drawNode(item, el, view, drawing, tagOf, counts);
        return;
      }
      case 'Panel': {
        const el = mark(child('clew-figure-panel'), node.id, node.tag);
        if (node.title !== undefined) drawing.markdown(child('clew-figure-panel-title', el), node.title);
        const inner = child('clew-figure-panel-body', el);
        for (const item of node.children) this.drawNode(item, inner, view, drawing, tagOf, counts);
        return;
      }
      case 'Table': {
        const wrap = mark(child('clew-figure-table'), node.id);
        if (node.title !== undefined) drawing.markdown(child('clew-figure-title', wrap), node.title);
        const lane = drawing.lanes.get(laneKey(node, ordinal()));
        const table = wrap.appendChild(createEl('table'));
        if (lane) wrap.style.paddingLeft = `${lane.name + 3}ch`;
        const head = table.createTHead().insertRow();
        for (const column of node.columns) drawing.markdown(head.appendChild(Object.assign(createEl('th'), { className: 'clew-figure-cell' })), column);
        const rows = table.createTBody();
        node.rows.forEach((cells, r) => {
          const rowId = node.rowIds[r];
          const row = mark(rows.insertRow(), rowId);
          cells.forEach((cell, c) => {
            const td = mark(row.insertCell(), `${rowId}.${c}`);
            td.classList.add('clew-figure-cell');
            if (cell === null) td.textContent = '–';
            else drawing.markdown(td, cell);
          });
        });
        return;
      }
      case 'Seq': {
        const wrap = mark(child('clew-figure-seq'), node.id);
        if (node.title !== undefined) drawing.markdown(child('clew-figure-title', wrap), node.title);
        const items = child('clew-figure-seq-items', wrap);
        node.items.forEach((item, i) => {
          const column = child('clew-figure-seq-item', items);
          if (node.index) child('clew-figure-seq-index', column).textContent = node.index === true ? String(i) : formatFigure(node.index[i] ?? '');
          const cell = mark(child('clew-figure-seq-cell', column), item.id);
          drawing.markdown(cell, `${status(cell.dataset.tag ?? '')}${formatFigure(item.label)}`);
        });
        const lane = drawing.lanes.get(laneKey(node, ordinal()));
        if (lane) child('clew-figure-lane', wrap).style.height = `${lane.count * POINTER_STEP + 4}px`;
        return;
      }
      case 'Node': {
        const el = mark(child(`clew-figure-node${node.shape === 'circle' ? ' is-circle' : ''}`), node.id, node.tag);
        drawing.markdown(child('clew-figure-node-label', el), `${status(el.dataset.tag ?? '')}${formatFigure(node.label)}`);
        if (node.sub !== undefined) drawing.markdown(child('clew-figure-node-sub', el), node.sub);
        return;
      }
      case 'Text':
        drawing.markdown(mark(child('clew-figure-text'), node.id), node.text);
        return;
      case 'Tex': {
        const el = mark(child('clew-figure-tex'), node.id);
        const lane = drawing.lanes.get(laneKey(node, ordinal()));
        drawing.tex(child('clew-figure-tex-math', el), node.tex);
        if (lane) {
          const column = child('clew-figure-tex-lane', el);
          column.setAttribute('aria-hidden', 'true');
          const sizes = child('clew-figure-tex-sizes', column);
          for (const name of lane.names) sizes.append(pointerLabel(name, '←', drawing.markdown));
        }
        return;
      }
      case 'Graph': {
        const layout = drawing.graphs.get(nodeKey(node, ordinal()));
        if (layout) drawGraph(child('clew-figure-canvas is-graph'), node, layout, tagOf, drawing.markdown);
        return;
      }
      case 'Quiz':
        drawQuiz(mark(child('clew-figure-quiz'), node.id), node, drawing.markdown, this.answers, this.host.send?.bind(this.host));
        return;
      case 'Plot': {
        for (const layer of node.children) if (layer.tag) drawing.used.add(layer.tag);
        const el = mark(child('clew-figure-plot', child('clew-figure-canvas')), node.id);
        el.style.width = `${this.width}px`;
        const chart = new PlotChart(el);
        chart.height = (width) => Math.min(360, (width * 2) / 3);
        chart.writeLabel = drawing.markdown;
        chart.render(plotModel(node));
        view.plots.push(chart);
        return;
      }
      case 'Diagram': {
        for (const layer of node.children) if (layer.tag) drawing.used.add(layer.tag);
        const el = mark(child('clew-figure-diagram', child('clew-figure-canvas')), node.id);
        const key = nodeKey(node, ordinal());
        const extent = drawing.extents.get(key) ?? diagramExtent(node);
        const shared = this.rooms.get(key) ?? { room: { left: 0, top: 0, right: 0, bottom: 0 }, paints: new Map() };
        this.rooms.set(key, shared);
        const paint = (): void => {
          const needed = drawDiagram(el, node, extent, this.width, drawing.markdown, shared.room);
          const grown = widen(shared.room, needed);
          if ((['left', 'top', 'right', 'bottom'] as const).every((side) => grown[side] === shared.room[side])) return;
          shared.room = grown;
          // Only the shown step repaints now; the others repaint with the grown room when they are shown.
          for (const [other, owner] of shared.paints) {
            if (other === paint) continue;
            if (owner.el.classList.contains('is-current')) other();
            else owner.dirty = true;
          }
        };
        shared.paints.set(paint, view);
        paint();
        view.diagrams.push(paint);
        return;
      }
      case 'Arrow':
      case 'Pointer':
        view.links.push(node);
        return;
    }
  }
}

const laneKey = (node: FigureNode, ordinal: number): string => `${node.type}:${('id' in node && node.id) || `#${ordinal}`}`;

