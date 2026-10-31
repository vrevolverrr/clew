import { computedColour, div, parseColour, svg, tagInk } from '@/renderer/figure/dom';
import { clampElevation, type Plot3Model, type View } from '@/renderer/figure/FigureData';
import { formatFigure } from '@/renderer/figure/formatFigure';
import { isPlain } from '@/renderer/figure/figureText';
import { type Box, type LabelBox, placeLabels } from '@/renderer/figure/placeLabels';
import { type Colours, type Overlay, type Scene3, scene3, textWidth, type Xy } from '@/renderer/figure/plot3/scene3';

const FALLBACK_WIDTH = 480;
const RAMP = 5;
/** Degrees per pixel of drag, and per arrow key. */
const DRAG = 0.5;
const KEY_STEP = 5;
/** How far outside the view a figure keeps its canvas bitmap, so it is drawn before it scrolls in. */
const KEEP_PX = 300;
/** Point and layer labels are 12 px text (`.clew-plot-label`), slightly wider when bold. */
const LABEL_PX = 13;

/**
 * The nearest ancestor outside the figure that scrolls (the chat pane), which the off-screen check watches; null for the
 * window. The figure's own wrapper scrolls sideways, and so computes as scrolling down too, but always holds the chart.
 */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let node = (el.closest('.clew-figure') ?? el).parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

/**
 * Draws a 3D Plot: its faces on a canvas, and the box, ticks, labels and overlays in SVG over it. The student turns it by
 * dragging or with the arrow keys. The canvas holds its bitmap only while the chart is the shown step's and near the view.
 */
export class Plot3Chart {
  private readonly frame = div('clew-plot-frame clew-plot3-frame');
  private readonly canvas = createEl('canvas');
  private readonly drawing = svg('svg', { class: 'clew-plot-svg clew-plot3-svg', 'aria-hidden': 'true' });
  private readonly rich = div('clew-plot-rich');
  private readonly typeset = new Map<string, HTMLElement>();
  /** The typeset labels this frame uses; the others leave the drawing at its end. */
  private readonly shown = new Set<HTMLElement>();
  private names = '';
  private model?: Plot3Model;
  private colours?: Colours & { edge: string; box: string; halo: string };
  /** Overlay inks resolved from the theme, by CSS colour. */
  private readonly inks = new Map<string, string>();
  private observer?: IntersectionObserver;
  private near = true;
  private active = false;
  private raf: number | null = null;
  private drag?: { x: number; y: number; view: View };
  /** The drawing's height for a width. */
  height: (width: number) => number = () => 300;
  /** Draws a label's Markdown and maths; the owner typesets it. */
  writeLabel: (el: HTMLElement, text: string) => void = (el, text) => {
    el.textContent = text;
  };
  /** `angle` is where the angle is kept, so the owner can share it between the charts of one Plot across steps and reruns. */
  constructor(readonly el: HTMLElement, private readonly angle: { get(): View | undefined; set(view: View): void }) {
    el.classList.add('clew-plot', 'clew-plot3');
    this.frame.tabIndex = 0;
    this.frame.setAttribute('role', 'img');
    this.canvas.className = 'clew-plot3-canvas';
    this.frame.append(this.canvas, this.drawing, this.rich);
    el.append(this.frame);
    this.frame.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.model) return;
      this.frame.setPointerCapture?.(event.pointerId);
      this.drag = { x: event.clientX, y: event.clientY, view: this.view() };
    });
    this.frame.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      const { x, y, view } = this.drag;
      this.turn({ azimuth: view.azimuth + (event.clientX - x) * DRAG, elevation: view.elevation + (event.clientY - y) * DRAG });
    });
    const end = (event: PointerEvent): void => {
      if (this.frame.hasPointerCapture?.(event.pointerId)) this.frame.releasePointerCapture(event.pointerId);
      if (!this.drag) return;
      this.drag = undefined;
      this.describe();
    };
    this.frame.addEventListener('pointerup', end);
    this.frame.addEventListener('pointercancel', end);
    this.frame.addEventListener('keydown', (event) => {
      // As a drag that way: up tilts the top of the box away.
      const step = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] }[event.key];
      if (!step || !this.model) return;
      event.preventDefault();
      const view = this.view();
      this.turn({ azimuth: view.azimuth + step[0], elevation: view.elevation + step[1] });
    });
    this.frame.addEventListener('dblclick', () => {
      if (this.model) this.turn(this.model.view);
    });
  }

  /** Shows `model`; it is drawn once the chart is active. */
  render(model: Plot3Model): void {
    this.model = model;
    this.names = model.children.flatMap((layer) => (layer.type === 'Fn' ? [layer.label ?? layer.id ?? ''] : [])).filter(Boolean).join(', ');
    // Typeset now, while the owner waits for its renders: a step shown later then measures its labels whole.
    for (const text of [model.xLabel, model.yLabel, model.zLabel]) if (text && !isPlain(text)) this.label(text, 'is-title');
    for (const layer of model.children) {
      const text = layer.type === 'Label' ? formatFigure(layer.text) : layer.type !== 'Fn' && layer.label !== undefined ? formatFigure(layer.label) : undefined;
      if (text && !isPlain(text)) this.label(text, layer.type === 'Label' ? '' : 'is-strong');
    }
    this.watch();
    this.repaint();
  }

  /** The shown step's chart is active; the others free their canvas. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (active) this.repaint();
    else this.release();
  }

  destroy(): void {
    this.observer?.disconnect();
    if (this.raf !== null) window.cancelAnimationFrame(this.raf);
    this.raf = null;
    this.release();
  }

  private view(): View {
    return this.angle.get() ?? this.model!.view;
  }

  private turn(view: View): void {
    this.angle.set({ azimuth: ((view.azimuth % 360) + 360) % 360, elevation: clampElevation(view.elevation) });
    if (this.raf !== null) return;
    this.raf = window.requestAnimationFrame(() => {
      this.raf = null;
      this.repaint();
    });
  }

  private watch(): void {
    if (this.observer || typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver((entries) => {
      const near = entries.some((entry) => entry.isIntersecting);
      if (near === this.near) return;
      this.near = near;
      this.repaint();
    }, { root: scroller(this.el), rootMargin: `${KEEP_PX}px 0px` });
    this.observer.observe(this.el);
  }

  private release(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  private readColours(): Colours & { edge: string; box: string; halo: string } {
    const ramp = Array.from({ length: RAMP }, (_, i) => parseColour(computedColour(this.el, `var(--clew-surface-${i + 1})`)));
    return { ramp, edge: computedColour(this.el, 'var(--clew-surface-edge)'), box: computedColour(this.el, 'var(--clew-surface-box)'), halo: computedColour(this.el, 'var(--background-primary)') };
  }

  private ink(overlay: Overlay): string {
    const css = overlay.tag ? tagInk(overlay.tag) : 'var(--text-normal)';
    let colour = this.inks.get(css);
    if (colour === undefined) {
      colour = computedColour(this.el, css);
      this.inks.set(css, colour);
    }
    return colour;
  }

  repaint(): void {
    const model = this.model;
    if (!model) return;
    // The frame's own width: laying out wider than it would cut off whatever lands past its edge.
    const width = Math.floor(this.el.clientWidth) || FALLBACK_WIDTH;
    const height = Math.round(this.height(width));
    this.frame.style.height = `${height}px`;
    if (!this.near || !this.active) {
      this.release();
      return;
    }
    const colours = (this.colours ??= this.readColours());
    this.shown.clear();
    const scene = scene3(model, this.view(), { width, height }, colours, (text, px) => this.size(text, 'is-title', px).width);
    this.paintCanvas(scene, width, height, colours);
    this.paintSvg(scene, width, height);
    for (const el of this.typeset.values()) if (!this.shown.has(el)) el.remove();
    // Not on every frame of a drag, which a screen reader would announce; once the drag ends.
    if (!this.drag) this.describe();
  }

  private describe(): void {
    const view = this.view();
    this.frame.setAttribute('aria-label', `3D plot${this.names ? ` of ${this.names}` : ''}, turned to azimuth ${Math.round(view.azimuth)}°, elevation ${Math.round(view.elevation)}°. Drag or use the arrow keys to turn it; double-click to reset.`);
  }

  private paintCanvas(scene: Scene3, width: number, height: number, colours: { edge: string; box: string; halo: string }): void {
    const ratio = window.devicePixelRatio || 1;
    const [w, h] = [Math.round(width * ratio), Math.round(height * ratio)];
    // Setting a canvas's size clears and reallocates it, which a frame of a drag at the same size does not need.
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    // The box's back edges go under the faces, so the surface hides them where it passes in front.
    context.strokeStyle = colours.box;
    context.lineWidth = 1;
    context.beginPath();
    for (const [p, q] of scene.box) {
      context.moveTo(p[0], p[1]);
      context.lineTo(q[0], q[1]);
    }
    context.stroke();
    context.strokeStyle = colours.edge;
    context.lineWidth = 0.5;
    context.lineJoin = 'round';
    for (const face of scene.faces) {
      context.globalAlpha = face.dim ? 0.35 : 1;
      context.beginPath();
      context.moveTo(face.pts[0][0], face.pts[0][1]);
      for (let i = 1; i < face.pts.length; i += 1) context.lineTo(face.pts[i][0], face.pts[i][1]);
      context.closePath();
      context.fillStyle = face.fill;
      context.fill();
      context.stroke();
    }
    context.globalAlpha = 1;
    this.paintOverlays(context, scene.overlays, colours.halo);
  }

  /**
   * Lines, arrows and dots over the faces, each on a band of the background so a tag colour reads on every height colour.
   * On the canvas, not in SVG: a figure can hold thousands of points, and SVG rebuilt each frame of a turn takes seconds.
   */
  private paintOverlays(context: CanvasRenderingContext2D, overlays: readonly Overlay[], halo: string): void {
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const trace = (points: readonly Xy[]): void => {
      context.beginPath();
      context.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i += 1) context.lineTo(points[i][0], points[i][1]);
    };
    for (let i = 0; i < overlays.length; i += 1) {
      const overlay = overlays[i];
      const ink = this.ink(overlay);
      if (overlay.kind === 'dot') {
        // Dots of one colour in a row are one path, so a cloud of thousands draws in two calls.
        context.beginPath();
        let j = i;
        for (; j < overlays.length; j += 1) {
          const dot = overlays[j];
          if (dot.kind !== 'dot' || this.ink(dot) !== ink) break;
          context.moveTo(dot.at[0] + 4.5, dot.at[1]);
          context.arc(dot.at[0], dot.at[1], 4.5, 0, 2 * Math.PI);
        }
        i = j - 1;
        context.lineWidth = 2;
        context.strokeStyle = halo;
        context.stroke();
        context.fillStyle = ink;
        context.fill();
        continue;
      }
      if (overlay.kind === 'note') continue;
      for (const [width, colour] of [[5.5, halo], [2.5, ink]] as const) {
        trace(overlay.points);
        context.lineWidth = width;
        context.strokeStyle = colour;
        context.stroke();
      }
      if (overlay.kind === 'arrow') {
        const [from, to] = overlay.points;
        const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
        const [ux, uy] = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
        context.beginPath();
        context.moveTo(to[0] + ux * 2, to[1] + uy * 2);
        context.lineTo(to[0] - ux * 10 - uy * 5, to[1] - uy * 10 + ux * 5);
        context.lineTo(to[0] - ux * 10 + uy * 5, to[1] - uy * 10 - ux * 5);
        context.closePath();
        context.lineWidth = 2;
        context.strokeStyle = halo;
        context.stroke();
        context.fillStyle = ink;
        context.fill();
      }
    }
  }

  private paintSvg(scene: Scene3, width: number, height: number): void {
    const root = this.drawing;
    root.replaceChildren();
    for (const [name, value] of Object.entries({ viewBox: `0 0 ${width} ${height}`, width, height })) root.setAttribute(name, String(value));
    const fixed: Box[] = [];
    const keep = (box: { x: number; y: number; w: number; h: number }): void => {
      fixed.push({ x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h });
    };
    for (const axis of scene.axes) svg('line', { x1: axis.from[0], y1: axis.from[1], x2: axis.to[0], y2: axis.to[1], class: 'clew-plot-axis' }, root);
    for (const tick of scene.ticks) {
      svg('line', { x1: tick.at[0], y1: tick.at[1], x2: tick.to[0], y2: tick.to[1], class: 'clew-plot-axis' }, root);
      if (!tick.text) continue;
      svg('text', { x: tick.textAt[0], y: tick.textAt[1], 'text-anchor': tick.anchor, class: 'clew-plot-tick' }, root, tick.text);
      keep(tick.box);
    }
    for (const title of scene.titles) {
      keep(title.box);
      if (isPlain(title.text)) svg('text', { x: title.at[0], y: title.at[1], 'text-anchor': title.anchor, class: 'clew-plot-tick clew-plot-title' }, root, title.text);
      else this.place(this.label(title.text, 'is-title'), title.box.x + title.box.w / 2, title.box.y + title.box.h / 2);
    }

    const pending: (LabelBox & { text: string; strong: boolean })[] = [];
    const avoid: (readonly [number, number])[][] = [];
    for (const overlay of scene.overlays) {
      if (overlay.kind === 'line' || overlay.kind === 'arrow') avoid.push(overlay.points);
      const text = overlay.kind === 'note' ? overlay.text : overlay.label;
      if (!text) continue;
      const strong = overlay.kind !== 'note';
      const at = 'at' in overlay ? overlay.at : overlay.points[Math.floor(overlay.points.length / 2)];
      pending.push({ x: at[0], y: at[1], ...this.size(text, strong ? 'is-strong' : '', LABEL_PX), text, strong, ...(strong ? {} : { center: true }) });
    }
    placeLabels(pending, { x0: 0, y0: 0, x1: width, y1: height }, avoid, fixed).forEach((at, i) => {
      const { text, strong, height: tall } = pending[i];
      if (isPlain(text)) svg('text', { x: at.x, y: at.y + tall - 3, class: `clew-plot-label${strong ? ' is-strong' : ''}` }, root, text);
      else this.place(this.label(text, strong ? 'is-strong' : ''), at.x, at.y);
    });
  }

  /** A label's box: plain text estimated, Markdown or maths measured once rendered (estimated until then); display maths can be twice a line's height. */
  private size(text: string, modifier: string, px: number): { width: number; height: number } {
    const estimate = { width: textWidth(text, px), height: 14 };
    if (isPlain(text)) return estimate;
    const box = this.label(text, modifier).getBoundingClientRect();
    return box.width ? { width: box.width, height: Math.max(14, box.height) } : estimate;
  }

  /** A label with Markdown or maths, typeset once per text and reused by every frame. */
  private label(text: string, modifier: string): HTMLElement {
    const key = `${modifier}\n${text}`;
    let el = this.typeset.get(key);
    if (!el) {
      el = div(`clew-plot-rich-label ${modifier}`.trim());
      this.writeLabel(el, text);
      this.typeset.set(key, el);
    }
    if (el.parentElement !== this.rich) this.rich.append(el);
    this.shown.add(el);
    return el;
  }

  private place(el: HTMLElement, x: number, y: number): void {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }
}
