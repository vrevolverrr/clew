// Runs inside the bench vault's Obsidian window (bundled to one script by run.ts): plays a reply in a fresh chat and
// measures each visual in it. It reports raw geometry; checks.ts decides what is wrong.
import type { Rect, StateGeometry, TextBox, VisualInfo } from './geometry';

interface ChatView {
  containerEl: HTMLElement;
  leaf: { detach(): void };
  playTurn(message: string, session: unknown, notePath: string): Promise<void>;
}

declare const app: {
  plugins: { plugins: { clew: { openFreshChat(): Promise<ChatView | null> } } };
  workspace: { getLeaf(newLeaf: boolean): { setViewState(state: object): Promise<void> } };
  vault: { saveConfig(): Promise<void> };
  changeTheme(theme: string): void;
};

const VISUAL = '.clew-reply-figure, .clew-reply-mermaid';
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// A window the OS is not drawing gets no animation frames, so a frame wait gives up after 100 ms.
const frame = () => new Promise((resolve) => { requestAnimationFrame(resolve); setTimeout(resolve, 100); });
let view: ChatView | null = null;
let dark: boolean | null = null;

/** Resolves once the element has had no DOM change for `quiet` ms, or after `max` ms. */
async function settle(el: Element, quiet = 250, max = 8000): Promise<void> {
  let last = performance.now();
  const observer = new MutationObserver(() => { last = performance.now(); });
  observer.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
  const start = performance.now();
  try {
    while (performance.now() - last < quiet && performance.now() - start < max) await wait(50);
  } finally {
    observer.disconnect();
  }
  await frame();
  await frame();
}

const visuals = (): HTMLElement[] => [...(view?.containerEl.querySelectorAll<HTMLElement>(VISUAL) ?? [])];
const playerRange = (el: Element) => el.querySelector<HTMLInputElement>('.clew-player input[type=range]');
const paramRanges = (el: Element) => [...el.querySelectorAll<HTMLInputElement>('input[type=range]')].filter((input) => !input.closest('.clew-player'));

function info(el: HTMLElement): VisualInfo {
  const range = playerRange(el);
  const steps = range ? Number(range.max) + 1 : Math.max(1, el.querySelectorAll('.clew-step-button').length);
  return {
    kind: el.matches('.clew-reply-mermaid') ? 'mermaid' : 'figure',
    steps,
    params: paramRanges(el).map((input) => ({ label: input.closest('[aria-label]')?.getAttribute('aria-label') ?? 'param', min: Number(input.min), max: Number(input.max), value: Number(input.value) })),
  };
}

export async function play(reply: string): Promise<VisualInfo[]> {
  // Clew opens a demo chat in the first chat leaf, or the collapsed right sidebar when there is none, so a main-area
  // leaf is made before the old one goes (detaching the main area's last leaf first leaves no tab group to open in).
  await app.workspace.getLeaf(true).setViewState({ type: 'clew-chat', active: true });
  view?.leaf.detach();
  view = await app.plugins.plugins.clew.openFreshChat();
  if (!view) throw new Error('Clew opened no chat');
  const session = {
    id: 'bench',
    async *send() { yield { type: 'text', delta: reply }; yield { type: 'done', status: 'completed' }; },
    skills: async () => [], setModel: async () => undefined, close: async () => undefined,
  };
  await view.playTurn('bench', session, '');
  const start = performance.now();
  while (view.containerEl.querySelector('.is-drawing') && performance.now() - start < 20_000) await wait(100);
  await settle(view.containerEl);
  return visuals().map(info);
}

export async function theme(isDark: boolean): Promise<void> {
  dark = isDark;
  app.changeTheme(dark ? 'obsidian' : 'moonstone');
  // Obsidian saves a config change a second later, and any write in `.obsidian` (the workspace, on opening a chat)
  // reloads the config from disk first, so an unsaved theme reverts to `system`, the OS theme.
  await app.vault.saveConfig();
  if (view) await settle(view.containerEl);
  checkTheme();
}

function checkTheme(): void {
  if (dark !== null && !document.body.classList.contains(dark ? 'theme-dark' : 'theme-light')) throw new Error(`The window is not in the ${dark ? 'dark' : 'light'} theme`);
}

function setRange(input: HTMLInputElement, value: number): void {
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Puts visual `index` at `width` px in `state` (`step:n` or `param:i:value`) and measures it. */
export async function measure(index: number, width: number, state: string): Promise<StateGeometry> {
  const el = visuals()[index];
  if (!el) throw new Error(`No visual ${index}`);
  if (el.style.width !== `${width}px`) {
    el.style.width = `${width}px`;
    el.style.maxWidth = 'none';
    await settle(el);
  }
  checkTheme();
  const [kind, a, b] = state.split(':');
  if (kind === 'step') {
    const range = playerRange(el);
    if (range) setRange(range, Number(a));
    else el.querySelectorAll<HTMLElement>('.clew-step-button')[Number(a)]?.click();
  } else if (kind === 'param') {
    setRange(paramRanges(el)[Number(a)], Number(b));
  }
  await settle(el);
  el.scrollIntoView({ block: 'start' });
  await frame();
  return geometry(el, state, width);
}

const box = (r: DOMRect, origin: DOMRect): Rect => ({ x: r.x - origin.x, y: r.y - origin.y, w: r.width, h: r.height });

function background(el: Element | null): string {
  for (let at = el; at; at = at.parentElement) {
    const colour = getComputedStyle(at).backgroundColor;
    if (colour && !/rgba\(.*,\s*0\)$/.test(colour) && colour !== 'transparent') return colour;
  }
  return getComputedStyle(document.body).backgroundColor;
}

/** The nearest ancestor that clips its content, up to the visual itself. */
function clipper(el: Element, root: Element): Element | null {
  for (let at = el.parentElement; at; at = at.parentElement) {
    if (at instanceof SVGSVGElement) return at;
    const style = getComputedStyle(at);
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') return at;
    if (at === root) return null;
  }
  return null;
}

function geometry(root: HTMLElement, state: string, width: number): StateGeometry {
  const origin = root.getBoundingClientRect();
  const texts: TextBox[] = [];
  const add = (el: Element, text: string, r: DOMRect, kind: TextBox['kind']) => {
    if (r.width < 1 || r.height < 1) return;
    const clip = clipper(el, root);
    let scroller = false;
    for (let at = el.parentElement; at && !scroller; at = at === root ? null : at.parentElement) {
      scroller = at.scrollWidth > at.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(at).overflowX);
    }
    const style = getComputedStyle(el);
    texts.push({
      kind, text: text.slice(0, 80), ...box(r, origin),
      clip: clip ? box(clip.getBoundingClientRect(), origin) : undefined, scrolls: scroller || undefined,
      fg: el instanceof SVGElement && style.fill !== 'none' && !el.closest('foreignObject') ? style.fill : style.color,
      bg: background(el instanceof SVGElement ? el.closest('svg')?.parentElement ?? el : el),
      px: parseFloat(style.fontSize),
    });
  };
  const visit = (el: Element): void => {
    if (el.matches('.clew-visually-hidden, mjx-assistive-mml, style, script')) return;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
    if (el.tagName === 'MJX-CONTAINER') {
      add(el, el.getAttribute('aria-label') ?? el.textContent ?? '', el.getBoundingClientRect(), 'math');
      return;
    }
    for (const child of el.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue;
      if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
        add(el, child.textContent.trim(), el.getBoundingClientRect(), 'svg');
        continue;
      }
      // One box per line: the union of a wrapped run would cover the inline elements beside it.
      const range = document.createRange();
      range.selectNodeContents(child);
      for (const line of range.getClientRects()) add(el, child.textContent.trim(), line, el.closest('button, input, .clew-player') ? 'control' : 'text');
    }
    for (const child of el.children) visit(child);
  };
  visit(root);
  const bad = [...root.querySelectorAll('svg *')].flatMap((el) => [...el.attributes]
    .filter((attr) => /NaN|Infinity|undefined/.test(attr.value))
    .map((attr) => `<${el.tagName} ${attr.name}="${attr.value.slice(0, 60)}">`));
  const error = root.querySelector('.clew-figure-error, .clew-render-error, .mermaid-error, [class*="error"]')?.textContent?.trim().slice(0, 300);
  const page = view?.containerEl.querySelector<HTMLElement>('.clew-messages');
  return {
    state, width,
    rect: { x: origin.x, y: origin.y, w: origin.width, h: origin.height },
    texts, badAttributes: bad.slice(0, 10), error: error || undefined,
    pageScrollsSideways: !!page && page.scrollWidth > page.clientWidth + 1,
  };
}

const frame3 = (root: Element) => root.querySelector<HTMLElement>('.clew-figure-step.is-current .clew-plot3-frame');
const angleOf = (root: Element) => /azimuth (-?\d+)°, elevation (-?\d+)°/.exec(frame3(root)?.getAttribute('aria-label') ?? '')?.slice(1).map(Number) ?? null;
const key = (target: HTMLElement, name: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name }));

/**
 * The shown step's 3D Plots in visual `index`: the share of canvas pixels painted, SVG marks and typeset labels that
 * fall outside the drawing (cut off by its frame), and how many 3D canvases in the visual hold a bitmap.
 */
export function inspect3(index: number): { painted: number[]; outside: string[]; live: number; shown: number } | null {
  const root = visuals()[index];
  const charts = [...(root?.querySelectorAll<HTMLElement>('.clew-figure-step.is-current .clew-plot3') ?? [])];
  if (!charts.length) return null;
  const outside: string[] = [];
  const painted = charts.map((chart) => {
    const frame = chart.querySelector('.clew-plot3-frame')!.getBoundingClientRect();
    for (const el of chart.querySelectorAll('.clew-plot3-svg path, .clew-plot3-svg circle, .clew-plot3-svg line, .clew-plot3-svg text, .clew-plot-rich-label')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.left < frame.left - 1 || r.top < frame.top - 1 || r.right > frame.right + 1 || r.bottom > frame.bottom + 1) {
        outside.push(`<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">${(el.textContent ?? '').trim().slice(0, 30)} at ${Math.round(r.left - frame.left)},${Math.round(r.top - frame.top)} ${Math.round(r.width)}×${Math.round(r.height)} in ${Math.round(frame.width)}×${Math.round(frame.height)}`);
      }
    }
    const canvas = chart.querySelector<HTMLCanvasElement>('canvas')!;
    if (!canvas.width || !canvas.height) return 0;
    // Read from a small copy: Chromium moves a canvas that is read back off the GPU, which would slow every later turn.
    const copy = document.createElement('canvas');
    copy.width = Math.ceil(canvas.width / 4);
    copy.height = Math.ceil(canvas.height / 4);
    const context = copy.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(canvas, 0, 0, copy.width, copy.height);
    const data = context.getImageData(0, 0, copy.width, copy.height).data;
    let filled = 0;
    let seen = 0;
    for (let i = 3; i < data.length; i += 4) {
      seen += 1;
      if (data[i] > 0) filled += 1;
    }
    return filled / seen;
  });
  const live = [...root.querySelectorAll<HTMLCanvasElement>('.clew-plot3-canvas')].filter((canvas) => canvas.width > 0).length;
  return { painted, outside, live, shown: charts.length };
}

/** Turns visual `index`'s 3D Plot, then changes step, churns its sliders while turning, and resizes it; lists where the angle was lost. */
export async function angleKept(index: number): Promise<string[]> {
  const root = visuals()[index];
  const target = root && frame3(root);
  if (!target) return [];
  const problems: string[] = [];
  const expect = (when: string, want: number[] | null) => {
    const now = angleOf(root);
    if (!want || !now || now.join('/') !== want.join('/')) problems.push(`${when}: ${now?.join('/') ?? 'no angle'} instead of ${want?.join('/') ?? '?'}`);
  };
  for (let i = 0; i < 3; i += 1) key(target, 'ArrowRight');
  await settle(root);
  const turned = angleOf(root);
  let want = turned;
  const range = playerRange(root);
  const buttons = root.querySelectorAll<HTMLElement>('.clew-step-button');
  if (range || buttons.length > 1) {
    if (range) setRange(range, 1);
    else buttons[1].click();
    await settle(root);
    expect('after a step change', turned);
    if (range) setRange(range, 0);
    else buttons[0].click();
    await settle(root);
  }
  const sliders = paramRanges(root);
  if (sliders.length) {
    const before = sliders.map((input) => Number(input.value));
    for (let round = 0; round < 5; round += 1) {
      for (const input of sliders) setRange(input, round % 2 ? Number(input.min) : Number(input.max));
      const shown = frame3(root);
      if (shown) key(shown, 'ArrowRight');
      await frame();
    }
    sliders.forEach((input, i) => setRange(input, before[i]));
    await settle(root, 400);
    want = turned && [(turned[0] + 25) % 360, turned[1]];
    expect('after slider churn while turning', want);
  }
  const width = root.style.width;
  root.style.width = `${Math.max(260, root.getBoundingClientRect().width - 120)}px`;
  await settle(root);
  expect('after a resize', want);
  root.style.width = width;
  await settle(root);
  resetAngle(root);
  return problems;
}

/** Back to the Plot's own view, so the next theme measures the angle the goldens were taken at. */
function resetAngle(root: HTMLElement): void {
  frame3(root)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
}

/**
 * Turns visual `index`'s first 3D Plot 5° a frame for 120 frames (or 3 s), with the arrow key a drag also redraws
 * through, and times the frames. Null when the visual has no 3D Plot.
 */
export async function turnTimes(index: number): Promise<{ frames: number; dropped: number; p95: number; median: number } | null> {
  const root = visuals()[index];
  const target = root && frame3(root);
  if (!target) return null;
  target.scrollIntoView({ block: 'center' });
  await frame();
  const times: number[] = [];
  const start = performance.now();
  // At most 3 s: a frame slower than that already answers the question, and a longer run freezes the window.
  for (let i = 0; i < 120 && performance.now() - start < 3_000; i += 1) {
    key(target, 'ArrowRight');
    // A window the OS is not drawing gets no frames; give up rather than wait forever.
    const at = await new Promise<number>((resolve) => { requestAnimationFrame(resolve); setTimeout(() => resolve(-1), 500); });
    if (at < 0) throw new Error('the bench window got no animation frames; it must be in front');
    times.push(at);
  }
  // The turn stops at 3 s, so how far it got depends on the machine's speed.
  resetAngle(root);
  await frame();
  const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  // A frame longer than one and a half display frames at 60 Hz missed its slot.
  return { frames: gaps.length, dropped: gaps.filter((gap) => gap > 25).length / gaps.length, p95: gaps[Math.floor(gaps.length * 0.95)], median: gaps[Math.floor(gaps.length / 2)] };
}

export function close(): void {
  view?.leaf.detach();
  view = null;
}
