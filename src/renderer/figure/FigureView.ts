import { CaptionStack } from '@/renderer/figure/CaptionStack';
import { div } from '@/renderer/figure/dom';
import { drawDiagram } from '@/renderer/figure/drawDiagram';
import { drawGraph, layoutGraph } from '@/renderer/figure/drawGraph';
import { drawLinks, type Link } from '@/renderer/figure/drawLinks';
import { drawParams } from '@/renderer/figure/drawParams';
import { plotModel } from '@/renderer/figure/drawPlot';
import { drawQuiz } from '@/renderer/figure/drawQuiz';
import { type FigureData, type FigureNode, TAGS, type Tag } from '@/renderer/figure/FigureData';
import { figureSandbox, type FigureSandbox } from '@/renderer/figure/FigureSandbox';
import { drawTex, drawTexIn, type Rgb, type TagColour, texTags } from '@/renderer/figure/figureTex';
import { figureText } from '@/renderer/figure/figureText';
import { formatFigure } from '@/renderer/figure/formatFigure';
import { status } from '@/renderer/figure/geometry';
import type { NetworkLayout } from '@/renderer/figure/network/layoutNetwork';
import { Playback } from '@/renderer/figure/Playback';
import { PlotChart } from '@/renderer/figure/plot/PlotChart';
import { validateFigure } from '@/renderer/figure/validateFigure';

export interface FigureHost {
  /** Renders Markdown into `el` with the chat's renderer; strings pass through `figureText` first. Resolves once MathJax has finished. */
  renderMarkdown(el: HTMLElement, markdown: string): Promise<void>;
  /** Sends a Quiz answer as the student's next message; false when the chat cannot take one now. */
  send?(message: string): boolean;
}

export type FigureOutcome = { drawn: true } | { drawn: false; error: string; repairable: boolean };

const MEANING: Record<Tag, string> = {
  active: 'being worked on now',
  done: 'done',
  match: 'a found or equal pair',
  new: 'just added or changed',
  dim: 'out of play',
  good: 'right',
  bad: 'wrong',
};
const FALLBACK_WIDTH = 480;

/** One step's drawing, and what must be repainted when the figure's width changes. */
interface StepView {
  el: HTMLElement;
  links: Link[];
  plots: PlotChart[];
  diagrams: (() => void)[];
  dirty: boolean;
}

/** What drawing one figure needs, shared by its steps. */
interface Drawing {
  markdown(el: HTMLElement, text: string | number): void;
  tex(el: HTMLElement, tex: string): void;
  graphs: Map<string, NetworkLayout>;
  lanes: Map<string, { count: number; name: number }>;
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

const graphKey = (graph: Extract<FigureNode, { type: 'Graph' }>, ordinal: number): string => graph.id ?? `#${ordinal}`;

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
  private captions?: CaptionStack;
  private params?: HTMLElement;
  private paramError?: HTMLElement;
  private body?: HTMLElement;
  private rerunning = false;
  private again = false;
  private width = 0;
  private readonly colours = new Map<string, Rgb>();

  constructor(parent: HTMLElement, private readonly host: FigureHost, private readonly sandbox: FigureSandbox = figureSandbox) {
    this.el = parent.appendChild(div('clew-figure'));
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resized());
      this.observer.observe(this.el);
    }
    watchTheme(this);
  }

  /** Runs the program with its declared defaults, validates and draws it; does not show errors. */
  async run(source: string): Promise<FigureOutcome> {
    this.source = source;
    const result = await this.execute();
    if (!result.ok) return { drawn: false, error: result.error, repairable: result.repairable };
    await this.draw(result.figure, false);
    return { drawn: true };
  }

  /** Replaces the figure with the error card: the sentence, and the source collapsed under it. */
  showError(error: string, source: string): void {
    this.clear();
    this.params = undefined;
    const card = this.el.appendChild(div('clew-figure-error'));
    card.setAttribute('role', 'note');
    card.appendChild(div('clew-figure-error-message')).textContent = error;
    const details = card.appendChild(document.createElement('details'));
    details.appendChild(document.createElement('summary')).textContent = 'Figure source';
    details.appendChild(document.createElement('pre')).appendChild(document.createElement('code')).textContent = source;
  }

  destroy(): void {
    this.controller.abort();
    this.observer?.disconnect();
    live.delete(this);
    this.generation += 1;
    this.clear();
  }

  /** Redraws with the theme's tag colours, which figure TeX holds as literals. */
  retheme(): void {
    this.colours.clear();
    if (this.figure && this.body?.isConnected) void this.draw(this.figure, true);
  }

  private async execute(): Promise<{ ok: true; figure: FigureData } | { ok: false; error: string; repairable: boolean }> {
    const near = (): number => Math.abs(this.el.getBoundingClientRect().top);
    const result = await this.sandbox.run(this.source, Object.fromEntries(this.values), near, this.controller.signal);
    if (!result.ok) return { ok: false, error: result.line ? `${result.error} (line ${result.line})` : result.error, repairable: result.repairable };
    const valid = validateFigure(result.payload);
    return valid.ok ? { ok: true, figure: valid.figure } : { ok: false, error: valid.error, repairable: true };
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
    this.playback?.stop();
    for (const step of this.steps) for (const plot of step.plots) plot.destroy();
    this.steps = [];
    this.body = undefined;
    this.el.replaceChildren();
  }

  private async draw(figure: FigureData, keepStep: boolean): Promise<void> {
    const generation = (this.generation += 1);
    this.figure = figure;
    const params = this.params?.isConnected ? this.params : undefined;
    const paramError = this.paramError;
    this.playback?.stop();
    for (const step of this.steps) for (const plot of step.plots) plot.destroy();
    this.el.replaceChildren();
    const renders: Promise<unknown>[] = [];
    const used = new Set<Tag>();
    const colour: TagColour = (tag, fill) => this.colour(tag, fill);
    const drawing: Drawing = {
      markdown: (el, text) => {
        if (typeof text === 'number') {
          el.textContent = formatFigure(text);
          return;
        }
        for (const tag of texTags(text)) used.add(tag);
        renders.push(this.host.renderMarkdown(el, figureText(drawTexIn(text, colour))));
      },
      tex: (el, tex) => {
        for (const tag of texTags(tex)) used.add(tag);
        renders.push(this.host.renderMarkdown(el, figureText(`$$\n${drawTex(tex, colour)}\n$$`)));
      },
      graphs: this.layoutGraphs(figure),
      lanes: this.pointerLanes(figure),
      used,
    };

    if (figure.title) drawing.markdown(this.el.appendChild(div('clew-figure-title')), figure.title);
    if (figure.params.length) {
      this.params = params ?? div('clew-figure-params');
      if (!params) drawParams(this.params, figure.params, this.values, (key, value) => {
        this.values.set(key, value);
        void this.rerun();
      });
      this.paramError = paramError ?? div('clew-figure-param-error');
      this.el.append(this.params, this.paramError);
    }
    const body = (this.body = this.el.appendChild(div('clew-figure-body')));
    const stack = body.appendChild(div('clew-figure-scroll')).appendChild(div('clew-figure-stack'));
    this.width = this.paneWidth();
    this.steps = figure.steps.map((step) => {
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

    const captions = (this.captions = new CaptionStack((el, text) => drawing.markdown(el, text)));
    body.append(captions.el);
    captions.set(figure.steps.map((step) => step.caption));
    if (used.size) {
      const key = body.appendChild(div('clew-figure-key'));
      for (const tag of TAGS.filter((t) => used.has(t))) {
        const item = key.appendChild(div('clew-figure-key-item'));
        const mark = item.appendChild(document.createElement('span'));
        mark.className = 'clew-figure-key-mark';
        mark.dataset.tag = tag;
        mark.textContent = status(tag).trim() || ' ';
        item.append(`${tag}: ${MEANING[tag]}`);
      }
    }
    this.playback = undefined;
    if (figure.steps.length > 1) {
      const playback = (this.playback = new Playback((index) => this.show(index)));
      body.append(playback.el);
    }
    this.show(keepStep ? Math.min(this.current, figure.steps.length - 1) : 0);

    // Links and reserved widths need every box measured, so they wait for each Markdown and MathJax render.
    await Promise.allSettled(renders);
    if (generation !== this.generation) return;
    this.reserveWidths();
    for (const step of this.steps) drawLinks(step.el, step.links, drawing.markdown);
    void document.fonts?.ready.then(() => {
      if (generation === this.generation) for (const step of this.steps) drawLinks(step.el, step.links, drawing.markdown);
    });
  }

  private show(index: number): void {
    this.current = index;
    this.steps.forEach((step, k) => step.el.classList.toggle('is-current', k === index));
    const step = this.steps[index];
    if (step?.dirty) this.repaint(step);
    this.captions?.show(this.figure?.steps[index]?.caption ?? '');
    this.playback?.update(this.steps.length - 1, index, { offset: 1 });
  }

  private resized(): void {
    const width = this.paneWidth();
    if (!this.steps.length || width === this.width) return;
    this.width = width;
    this.steps.forEach((step, k) => {
      if (k === this.current) this.repaint(step);
      else step.dirty = true;
    });
  }

  private repaint(step: StepView): void {
    step.dirty = false;
    for (const plot of step.plots) {
      plot.el.style.width = `${this.width}px`;
      plot.repaint();
    }
    for (const diagram of step.diagrams) diagram();
    if (this.figure) drawLinks(step.el, step.links, (el, text) => {
      if (typeof text === 'number') el.textContent = formatFigure(text);
      else void this.host.renderMarkdown(el, figureText(drawTexIn(text, (tag, fill) => this.colour(tag, fill))));
    });
  }

  private paneWidth(): number {
    return Math.floor(this.el.clientWidth) || FALLBACK_WIDTH;
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
        const key = graphKey(node, ordinal++);
        uses.set(key, [...(uses.get(key) ?? []), node]);
      });
    }
    return new Map([...uses].map(([key, graphs]) => [key, layoutGraph(graphs)]));
  }

  /** Room each Seq (below), Table (left) and Tex (right) keeps for its pointers: the most in any step, and the longest name. */
  private pointerLanes(figure: FigureData): Map<string, { count: number; name: number }> {
    const lanes = new Map<string, { count: number; name: number }>();
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
        if (node.type === 'Tex') for (const match of node.tex.matchAll(/\\cssId\s*\{([^}]*)\}/g)) owner.set(match[1].trim(), key);
      });
      walk(step.root, (node) => {
        if (node.type !== 'Pointer' || !owner.has(node.to)) return;
        const key = owner.get(node.to)!;
        const count = (counts.get(node.to) ?? 0) + 1;
        counts.set(node.to, count);
        const lane = lanes.get(key) ?? { count: 0, name: 0 };
        lanes.set(key, { count: Math.max(lane.count, count), name: Math.max(lane.name, formatFigure(node.name).length) });
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
        if (!(el instanceof HTMLElement) || el.tagName === 'TR' || el.closest('.clew-figure-graph, .clew-figure-plot, .clew-figure-diagram, mjx-container')) continue;
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
        const table = wrap.appendChild(document.createElement('table'));
        if (lane) wrap.style.paddingLeft = `${lane.name + 3}ch`;
        const head = table.createTHead().insertRow();
        for (const column of node.columns) drawing.markdown(head.appendChild(document.createElement('th')), column);
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
        if (lane) child('clew-figure-lane', wrap).style.height = `${lane.count * 20 + 4}px`;
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
        if (lane) el.style.paddingRight = `${lane.name + 3}ch`;
        drawing.tex(el, node.tex);
        return;
      }
      case 'Graph': {
        const layout = drawing.graphs.get(graphKey(node, ordinal()));
        if (layout) drawGraph(parent, node, layout, tagOf, drawing.markdown);
        return;
      }
      case 'Quiz':
        drawQuiz(mark(child('clew-figure-quiz'), node.id), node, drawing.markdown, this.host.send?.bind(this.host));
        return;
      case 'Plot': {
        const el = mark(child('clew-figure-plot'), node.id);
        el.style.width = `${this.width}px`;
        const chart = new PlotChart(el, false);
        chart.height = (width) => Math.min(360, (width * 2) / 3);
        chart.render(plotModel(node));
        view.plots.push(chart);
        return;
      }
      case 'Diagram': {
        const el = mark(child('clew-figure-diagram'), node.id);
        const paint = (): void => {
          el.style.width = `${this.width}px`;
          drawDiagram(el, node, drawing.markdown);
        };
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

