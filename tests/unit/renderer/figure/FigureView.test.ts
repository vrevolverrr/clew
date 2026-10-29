/** @jest-environment jsdom */
import type { FigureSandbox, RunResult } from '@/renderer/figure/FigureSandbox';
import { type FigureHost, FigureView } from '@/renderer/figure/FigureView';

type El = { type: string; props: Record<string, unknown>; children: unknown[] };
const el = (type: string, props: Record<string, unknown> = {}, ...children: unknown[]): El => ({ type, props, children });
const payload = (frames: { caption: string; root: El }[], params: Record<string, unknown> = {}): unknown => ({ params, frames });

let observers: { disconnected: boolean }[] = [];

beforeEach(() => {
  observers = [];
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    disconnected = false;
    constructor() {
      observers.push(this);
    }
    observe(): void {}
    disconnect(): void {
      this.disconnected = true;
    }
  };
  document.body.replaceChildren();
});

/** A sandbox that answers each run with the next payload, or a function of the params it was sent. */
function sandbox(answer: (params: Record<string, unknown>) => unknown): FigureSandbox & { calls: Record<string, unknown>[]; release(): void } {
  const calls: Record<string, unknown>[] = [];
  let held: (() => void)[] = [];
  let hold = false;
  return {
    calls,
    hold() { hold = true; },
    release() { const now = held; held = []; hold = false; now.forEach((go) => go()); },
    run: (_source: string, params: Record<string, unknown>) => {
      calls.push(params);
      const result: RunResult = { ok: true, payload: answer(params) };
      return hold ? new Promise((resolve) => held.push(() => resolve(result))) : Promise.resolve(result);
    },
  } as unknown as FigureSandbox & { calls: Record<string, unknown>[]; release(): void };
}

/** A host whose Markdown renders resolve only when the test says. */
function host(): FigureHost & { rendered: string[]; math: string[]; finish(): void; sent: string[]; accept: boolean } {
  const pending: (() => void)[] = [];
  const self = {
    rendered: [] as string[],
    math: [] as string[],
    sent: [] as string[],
    accept: true,
    finish: () => pending.splice(0).forEach((go) => go()),
    renderMarkdown: (target: HTMLElement, markdown: string) => {
      self.rendered.push(markdown);
      target.textContent = markdown;
      return new Promise<void>((resolve) => pending.push(resolve));
    },
    renderMath: (tex: string, display: boolean) => {
      self.math.push(display ? `$$${tex}$$` : `$${tex}$`);
      return Object.assign(document.createElement('span'), { textContent: tex });
    },
    finishRenderMath: () => Promise.resolve(),
    send: (message: string) => {
      self.sent.push(message);
      return self.accept;
    },
  };
  return self;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const linked = payload([
  { caption: '**First**', root: el('Row', {}, el('Node', { id: 'a', label: 'A', tag: 'active' }), el('Node', { id: 'b', label: 'B' }), el('Arrow', { from: 'a', to: 'b' })) },
  { caption: '**Second**', root: el('Row', {}, el('Node', { id: 'a', label: 'A', tag: 'done' }), el('Node', { id: 'b', label: 'B', tag: 'new' }), el('Arrow', { from: 'a', to: 'b' })) },
]);

describe('FigureView', () => {
  it('waits for every Markdown render before it places links or resolves', async () => {
    const markdown = host();
    const view = new FigureView(document.body, markdown, sandbox(() => linked));
    let done = false;
    const outcome = view.run('src').then((result) => {
      done = true;
      return result;
    });
    await flush();
    expect(done).toBe(false);
    expect(view.el.querySelector('.clew-figure-links')).toBeNull();
    markdown.finish();
    await expect(outcome).resolves.toEqual({ drawn: true });
    expect(view.el.querySelectorAll('.clew-figure-links')).toHaveLength(2);
  });

  it('ignores the renders of an earlier draw that resolve late', async () => {
    const slow = host();
    const view = new FigureView(document.body, slow, sandbox(() => linked));
    const first = view.run('one');
    await flush();
    const stale = slow.finish;
    // The second draw's renders resolve at once.
    slow.renderMarkdown = (target, markdown) => {
      target.textContent = markdown;
      return Promise.resolve();
    };
    await view.run('two');
    view.el.querySelectorAll('.clew-figure-links').forEach((links) => links.remove());
    stale();
    await first;
    expect(view.el.querySelectorAll('.clew-figure-links')).toHaveLength(0);
  });

  it('draws every step in one grid cell and shows only the current one', async () => {
    const markdown = host();
    const view = new FigureView(document.body, markdown, sandbox(() => linked));
    const outcome = view.run('src');
    await flush();
    markdown.finish();
    await outcome;
    const steps = [...view.el.querySelectorAll('.clew-figure-step')];
    expect(steps).toHaveLength(2);
    expect(new Set(steps.map((step) => step.parentElement)).size).toBe(1);
    expect(steps.map((step) => step.classList.contains('is-current'))).toEqual([true, false]);
    view.el.querySelector<HTMLButtonElement>('button[aria-label="Next"]')!.click();
    expect(steps.map((step) => step.classList.contains('is-current'))).toEqual([false, true]);
  });

  it('keeps every caption in the stack, and keys only the tags whose mark does not explain itself', async () => {
    const markdown = host();
    const view = new FigureView(document.body, markdown, sandbox(() => linked));
    void view.run('src');
    await flush();
    expect([...view.el.querySelectorAll('.clew-caption-sizes > .clew-caption')].map((caption) => caption.textContent)).toEqual(['**First**', '**Second**']);
    expect([...view.el.querySelectorAll('.clew-figure-key-mark')].map((mark) => (mark as HTMLElement).dataset.tag)).toEqual(['new']);
  });

  it('writes a TeX anchor as a data attribute in its own step only', async () => {
    const markdown = host();
    const tex = (anchor: boolean): El => el('Tex', { tex: anchor ? '\\cssId{r2}{0} + 1' : '0 + 1' });
    const view = new FigureView(document.body, markdown, sandbox(() => payload([{ caption: 'a', root: tex(true) }, { caption: 'b', root: tex(false) }])));
    void view.run('src');
    await flush();
    expect(markdown.math).toEqual(['$$\n\\data{figure-id=r2}{0} + 1\n$$', '$$\n0 + 1\n$$']);
  });

  it('draws text that is only words and maths with MathJax at once, and Markdown through the render', async () => {
    const markdown = host();
    const view = new FigureView(document.body, markdown, sandbox(() => payload([{ caption: '**Bold**', root: el('Node', { id: 'a', label: 'Force $mg$' }) }])));
    void view.run('src');
    await flush();
    expect(markdown.math).toEqual(['$mg$']);
    expect([...new Set(markdown.rendered)]).toEqual(['**Bold**']);
    expect(view.el.querySelector('.clew-figure-node-label')!.textContent).toBe('Force mg');
  });

  it("frames a Diagram for every value of its slider, so moving it never moves the drawing", async () => {
    const markdown = host();
    const runs = sandbox((params) => payload(
      [{ caption: '', root: el('Diagram', { width: 1, height: 1 }, el('Points', { pts: [[0, 0], [params.n ?? 3, 1]] })) }],
      { n: { label: 'n', min: 1, max: 9, step: 1, value: 3 } },
    ));
    const view = new FigureView(document.body, markdown, runs);
    await view.run('src');
    for (let i = 0; i < 4; i += 1) await flush();
    const height = (): string | null => view.el.querySelector('.clew-figure-body:not(.is-pending) svg')!.getAttribute('height');
    const first = height();
    const slider = view.el.querySelector<HTMLInputElement>('input[type="range"]')!;
    for (const value of ['9', '1']) {
      slider.value = value;
      slider.dispatchEvent(new Event('input'));
      for (let i = 0; i < 4; i += 1) await flush();
      expect(height()).toBe(first);
    }
    expect(runs.calls.map((params) => params.n).filter((n) => n !== undefined)).toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it('creates one ResizeObserver per figure however many plots it has, and disconnects it on destroy', async () => {
    const markdown = host();
    const plot = (id: string): El => el('Plot', { id, x: [0, 1] }, el('Points', { pts: [[0.5, 0.5]] }));
    const view = new FigureView(document.body, markdown, sandbox(() => payload([
      { caption: 'a', root: el('Row', {}, plot('p'), plot('q')) },
      { caption: 'b', root: el('Row', {}, plot('p'), plot('q')) },
    ])));
    void view.run('src');
    await flush();
    expect(view.el.querySelectorAll('.clew-plot')).toHaveLength(4);
    expect(observers).toHaveLength(1);
    view.destroy();
    expect(observers[0].disconnected).toBe(true);
  });

  it('reruns once for a burst of param changes, with the latest value', async () => {
    const markdown = host();
    const runs = sandbox((params) => payload([{ caption: '', root: el('Node', { id: 'a', label: String(params.n ?? 3) }) }], { n: { label: 'n', min: 1, max: 9, step: 1, value: 3 } }));
    const view = new FigureView(document.body, markdown, runs);
    void view.run('src');
    await flush();
    markdown.finish();
    await flush();
    (runs as unknown as { hold(): void }).hold();
    const slider = view.el.querySelector<HTMLInputElement>('input[type="range"]')!;
    for (const value of ['4', '5', '6']) {
      slider.value = value;
      slider.dispatchEvent(new Event('input'));
    }
    runs.release();
    await flush();
    runs.release();
    await flush();
    expect(runs.calls).toEqual([{}, { n: 4 }, { n: 6 }]);
  });

  it('sends a Quiz answer through the host, and asks the student to wait when it cannot', async () => {
    const markdown = host();
    const view = new FigureView(document.body, markdown, sandbox(() => payload([{ caption: '', root: el('Quiz', { question: 'Which?', options: ['x', 'y'], correct: 'y' }) }])));
    void view.run('src');
    await flush();
    markdown.accept = false;
    view.el.querySelectorAll<HTMLButtonElement>('.clew-quiz-option')[1].click();
    view.el.querySelector<HTMLButtonElement>('.clew-quiz-submit')!.click();
    expect(view.el.querySelector('.clew-quiz-note')!.textContent).toBe('Wait for the reply to finish, then submit.');
    markdown.accept = true;
    view.el.querySelector<HTMLButtonElement>('.clew-quiz-submit')!.click();
    expect(markdown.sent).toEqual(['My answer: y (correct). Question: Which?', 'My answer: y (correct). Question: Which?']);
    expect(view.el.querySelector('.clew-quiz-bar')).toBeNull();
  });

  it('keeps a sent Quiz answered when the figure redraws', async () => {
    const markdown = host();
    const view = new FigureView(document.body, markdown, sandbox(() => payload([{ caption: '', root: el('Quiz', { question: 'Which?', options: ['x', 'y'], correct: 'y' }) }])));
    void view.run('src');
    await flush();
    view.el.querySelectorAll<HTMLButtonElement>('.clew-quiz-option')[0].click();
    view.el.querySelector<HTMLButtonElement>('.clew-quiz-submit')!.click();
    view.retheme();
    markdown.finish();
    await flush();
    expect(view.el.querySelectorAll('.clew-quiz')).toHaveLength(1);
    expect(view.el.querySelector('.clew-quiz-bar')).toBeNull();
    expect(view.el.querySelector('.clew-quiz-option.is-wrong')).not.toBeNull();
    expect(markdown.sent).toHaveLength(1);
  });

  it('keeps an unnamed Diagram one size over the steps when a named one comes before it', async () => {
    const diagrams = (pt: number[]): El => el('Row', {}, el('Diagram', { id: 'a', width: 1, height: 1 }, el('Points', { pts: [[1, 1]] })), el('Diagram', { width: 1, height: 1 }, el('Points', { pts: [pt] })));
    const view = new FigureView(document.body, host(), sandbox(() => payload([{ caption: 'One', root: diagrams([20, 10]) }, { caption: 'Two', root: diagrams([5, 10]) }])));
    await expect(view.run('src')).resolves.toEqual({ drawn: true });
    const widths = [...view.el.querySelectorAll('.clew-figure-step')].map((step) => step.querySelectorAll('svg')[1].getAttribute('width'));
    expect(widths[0]).toBe(widths[1]);
  });

  it('draws a Diagram whose only point is the origin', async () => {
    const view = new FigureView(document.body, host(), sandbox(() => payload([{ caption: '', root: el('Diagram', { width: 1, height: 1 }, el('Points', { pts: [[0, 0]] })) }])));
    await expect(view.run('src')).resolves.toEqual({ drawn: true });
    expect(Number(view.el.querySelector('svg')!.getAttribute('width'))).toBeGreaterThan(0);
  });

  it('reports a failed run without drawing, and shows the error card on request', async () => {
    const failing = { run: () => Promise.resolve({ ok: false, error: 'Step 2: TypeError: x', line: 7, repairable: true }) } as unknown as FigureSandbox;
    const view = new FigureView(document.body, host(), failing);
    await expect(view.run('src')).resolves.toEqual({ drawn: false, error: 'Step 2: TypeError: x (line 7)', repairable: true });
    view.showError('Step 2: TypeError: x (line 7)', 'src');
    expect(view.el.querySelector('.clew-figure-error-message')!.textContent).toBe('Step 2: TypeError: x (line 7)');
    expect(view.el.querySelector('details code')!.textContent).toBe('src');
  });
});
