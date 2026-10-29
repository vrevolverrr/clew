/**
 * @jest-environment jsdom
 */
import type { ToolStatus } from '@/agents/types';
import { ReplyView } from '@/chat/view/ReplyView';
import type { MarkdownTarget } from '@/chat/view/TextBlock';
import { figureSandbox } from '@/renderer/figure/FigureSandbox';
import type { TourEvent } from '@/tour/HighlightTour';
import type { WalkthroughHost } from '@/tour/view/Walkthrough';

jest.mock('obsidian', () => ({ setIcon: jest.fn() }), { virtual: true });
// A figure's fence here holds the payload a program would return, as JSON; `!` starts one that fails.
jest.mock('@/renderer/figure/FigureSandbox', () => ({
  figureSandbox: {
    warm: jest.fn(),
    run: jest.fn((source: string) => Promise.resolve(source.startsWith('!') ? { ok: false, error: source.slice(1), repairable: true } : { ok: true, payload: JSON.parse(source) as unknown })),
  },
}));

const figure = (root: unknown, caption = ''): string => JSON.stringify({ params: {}, frames: [{ caption, root }] });
const node = (label: string): unknown => ({ type: 'Node', props: { id: 'n', label }, children: [] });
const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

const markdown = {
  render: async (el: HTMLElement, text: string) => {
    el.textContent = text;
  },
  release: () => undefined,
} as unknown as MarkdownTarget;

function hostOf(): WalkthroughHost & { listeners: Array<(event: TourEvent) => void>; picked: Array<[number, number]> } {
  const listeners: Array<(event: TourEvent) => void> = [];
  const picked: Array<[number, number]> = [];
  return {
    listeners,
    picked,
    pick: (steps, index) => picked.push([steps.length, index]),
    watch: (listener) => void listeners.push(listener),
  };
}

function blocks(el: HTMLElement): string[] {
  return [...el.children].filter((child) => !child.matches('.clew-reply-footer')).map((child) => `${child.className.split(' ')[0]}: ${
    child.querySelector('.clew-tools-summary')?.textContent ?? child.textContent}`);
}

describe('ReplyView', () => {
  it('releases playing figures and pending renders when its chat closes', async () => {
    const el = document.body.createDiv();
    const reply = new ReplyView(el, markdown, hostOf());
    const stepped = JSON.stringify({ params: {}, frames: [{ caption: 'One', root: node('1') }, { caption: 'Two', root: node('2') }] });
    reply.appendText('```figure\n' + stepped + '\n```');
    reply.finish();
    await settle();
    jest.useFakeTimers();
    try {
      const idle = jest.getTimerCount();
      el.querySelector<HTMLButtonElement>('[aria-label="Play"]')!.click();
      expect(jest.getTimerCount()).toBeGreaterThan(idle);
      reply.destroy();
      expect(jest.getTimerCount()).toBe(idle);
      jest.advanceTimersByTime(1000);
      expect(el.querySelector('.clew-player')).toBeNull();
    } finally { jest.useRealTimers(); }
  });
  let el: HTMLElement;
  let reply: ReplyView;
  let host: ReturnType<typeof hostOf>;
  const tool = (id: string, name: string, status: ToolStatus, title = `${name} ${id}`) =>
    reply.tool({ type: 'tool', id, name, title, status });

  beforeEach(() => {
    el = document.createElement('div');
    host = hostOf();
    reply = new ReplyView(el, markdown, host);
  });

  afterEach(() => reply.finish());

  it('keeps a preamble between tool calls as its own text, in order', () => {
    tool('a', 'Read', 'running');
    tool('a', 'Read', 'done');
    reply.appendText('Let me check the cost formula.');
    tool('b', 'Grep', 'running');
    tool('b', 'Grep', 'done');
    reply.appendText('Put S in the outer loop.');
    reply.finish();

    expect(blocks(el)).toEqual([
      'clew-tools: Used 1 Read',
      'clew-reply-text: Let me check the cost formula.',
      'clew-tools: Used 1 Grep',
      'clew-reply-text: Put S in the outer loop.',
    ]);
  });

  it('groups consecutive tool calls, even with whitespace between them, with a row per call', () => {
    tool('a', 'Read', 'done', 'Read notes.md');
    reply.appendText('\n\n');
    tool('b', 'Bash', 'failed', 'Ran ls');
    reply.finish();

    expect(blocks(el)).toEqual(['clew-tools: Used 1 Read and 1 Bash (1 failed)']);
    expect([...el.querySelectorAll('.clew-tool')].map((row) => row.textContent)).toEqual(['Read notes.md', 'Ran ls']);
  });

  it('names the calls running now, then counts every call by name once they end', () => {
    tool('a', 'Bash', 'running');
    expect(blocks(el)).toEqual(['clew-tools: Using Bash']);

    tool('b', 'Read', 'running');
    tool('c', 'Read', 'running');
    expect(blocks(el)).toEqual(['clew-tools: Using Bash, Read']);
    expect(el.querySelector('.clew-tools')!.classList.contains('is-running')).toBe(true);

    for (const id of ['a', 'b', 'c']) tool(id, id === 'a' ? 'Bash' : 'Read', 'done');
    reply.finish();
    expect(blocks(el)).toEqual(['clew-tools: Used 2 Reads and 1 Bash']);
    expect(el.querySelector('.clew-tools')!.classList.contains('is-running')).toBe(false);
  });

  it('names the two most-used kinds and counts the rest as other', () => {
    for (const [id, name] of [['1', 'Read'], ['2', 'Read'], ['3', 'Bash'], ['4', 'Grep'], ['5', 'Glob'], ['6', 'WebFetch']]) {
      tool(id!, name!, 'done');
    }
    reply.finish();

    expect(blocks(el)).toEqual(['clew-tools: Used 2 Reads, 1 Bash, and 3 other']);
  });

  function withFakeTimers(run: () => void): void {
    reply.finish();
    jest.useFakeTimers();
    try {
      el = document.createElement('div');
      host = hostOf();
    reply = new ReplyView(el, markdown, host);
      run();
    } finally {
      jest.useRealTimers();
    }
  }

  it('counts the seconds while a call runs and holds the total once the turn ends', () => {
    withFakeTimers(() => {
      tool('a', 'Bash', 'running');
      const time = () => el.querySelector('.clew-tools-time')!.textContent;
      expect(time()).toBe('');

      jest.advanceTimersByTime(3000);
      expect(time()).toBe('3s');

      jest.advanceTimersByTime(62_000);
      expect(time()).toBe('1m 5s');

      reply.finish();
      jest.advanceTimersByTime(5000);
      expect(time()).toBe('1m 5s');
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  it('shows a working line from the start, which the first tool call takes over', () => {
    expect(el.querySelector('.clew-tools')!.classList.contains('is-running')).toBe(true);
    expect(blocks(el)).toEqual([expect.stringMatching(/^clew-tools: \w.+\w$/)]);

    tool('a', 'Read', 'running');
    expect(blocks(el)).toEqual(['clew-tools: Using Read']);
  });

  it('drops a working line under a second when the reply starts with text', () => {
    reply.appendText('\n');
    expect(el.querySelectorAll('.clew-tools')).toHaveLength(1);

    reply.appendText('Look at line 3.');
    reply.finish();
    expect(blocks(el)).toEqual(['clew-reply-text: Look at line 3.']);
  });

  it('settles a longer working line as the time spent thinking', () => {
    withFakeTimers(() => {
      jest.advanceTimersByTime(3000);
      reply.appendText('Look at line 3.');
      reply.finish();
      expect(blocks(el)).toEqual(['clew-tools: Thought for 3s', 'clew-reply-text: Look at line 3.']);
      expect(el.querySelector('.clew-tools-time')!.textContent).toBe('');

      el.querySelector<HTMLElement>('.clew-tools-header')!.click();
      expect(el.querySelector('.clew-tools')!.classList.contains('is-open')).toBe(false);
    });
  });

  it('drops the working line after a run of calls when text follows, however long it ran', () => {
    withFakeTimers(() => {
      tool('a', 'Read', 'running');
      tool('a', 'Read', 'done');
      jest.advanceTimersByTime(3000);
      reply.appendText('It tracks active users.');
      reply.finish();
      expect(blocks(el)).toEqual(['clew-tools: Used 1 Read', 'clew-reply-text: It tracks active users.']);
    });
  });

  it('follows text with a working line when the agent thinks again, and drops it at the end', () => {
    reply.appendText('Let me check.');
    reply.thinking();
    reply.thinking();
    expect([...el.children].map((child) => child.className)).toEqual(['clew-reply-text', 'clew-tools is-running is-empty']);

    reply.finish();
    expect(blocks(el)).toEqual(['clew-reply-text: Let me check.']);
  });

  it('follows a run of calls with a working line, which the next call replaces in the same run', () => {
    tool('a', 'Read', 'running');
    reply.thinking();
    expect(el.children).toHaveLength(1);

    tool('a', 'Read', 'done');
    expect(blocks(el)).toEqual(['clew-tools: Used 1 Read', expect.stringMatching(/^clew-tools: \w.+\w$/)]);

    tool('b', 'Grep', 'running');
    expect(blocks(el)).toEqual(['clew-tools: Using Grep']);
  });

  it('drops the working line when the turn ends before any event', () => {
    reply.finish();
    expect(el.children).toHaveLength(0);
  });

  it('shows a drawing card while a diagram streams, and swaps it for the diagram once that renders', async () => {
    const card = () => el.querySelector('.clew-diagram-card')?.textContent;
    reply.appendText('Flow:\n```mermaid\nflowchart LR\n  A --> B\n');
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(card()).toBe('Drawing diagram');
    expect(el.querySelector('.clew-diagram')).toBeNull();

    reply.appendText('```\nDone.');
    reply.finish();
    await Promise.resolve();
    expect(card()).toBeUndefined();
    expect(el.querySelector('.clew-diagram')!.textContent).toBe('```mermaid\nflowchart LR\n  A --> B\n```');
  });

  it.each(['mermaid', 'figure'])('keeps the %s loading effect at its original height while the completed figure grows', async (kind) => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const media = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    let finish!: () => void;
    const finished = new Promise<Animation>((resolve) => { finish = () => resolve({} as Animation); });
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: jest.fn(() => ({ finished })) });
    try {
      const source = kind === 'mermaid' ? 'flowchart LR\nA --> B' : figure(node('Total'));
      reply.appendText(`\`\`\`${kind}\n${source}\n`);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const card = el.querySelector<HTMLElement>('.clew-diagram-card')!;
      const frame = card.parentElement!;
      Object.defineProperty(frame, 'offsetHeight', { get: () => frame.classList.contains('is-drawing') ? 160 : 600 });
      Object.defineProperty(card, 'offsetHeight', { get: () => parseFloat(card.style.height) || frame.offsetHeight });
      expect(card.offsetHeight).toBe(160);

      reply.appendText('```');
      reply.finish();
      await settle();

      expect(frame.classList.contains('is-drawing')).toBe(false);
      expect(card.offsetHeight).toBe(160);
      expect(card.parentElement).toBe(frame);
      finish(); await settle();
      expect(frame.querySelector('.clew-diagram-card')).toBeNull();
    } finally {
      finish?.();
      if (original) Object.defineProperty(HTMLElement.prototype, 'animate', original);
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
      if (media) Object.defineProperty(window, 'matchMedia', media);
      else Reflect.deleteProperty(window, 'matchMedia');
    }
  });

  it('shows a saved reply\'s failed figure as its error card, with the source collapsed, while other figures still draw', async () => {
    reply.appendText('```figure\n!Step 2: TypeError: x (line 7)\n```\n\n```figure\n' + figure(node('Safe')) + '\n```');
    reply.finish();
    await settle();
    expect([...el.querySelectorAll('.clew-figure-error-message')].map((error) => error.textContent)).toEqual(['Step 2: TypeError: x (line 7)']);
    expect(el.querySelector('details summary')?.textContent).toBe('Figure source');
    expect(el.querySelector('details')?.open).toBe(false);
    expect(el.querySelector('details code')?.textContent).toBe('!Step 2: TypeError: x (line 7)');
    expect(el.querySelector('.clew-figure-node')?.textContent).toContain('Safe');
  });

  it('shows a drawing card while a figure streams, and draws it once the fence closes', async () => {
    const run = jest.mocked(figureSandbox.run);
    run.mockClear();
    const frame = () => el.querySelector('.clew-reply-figure')!;
    reply.appendText('```figure\n' + figure(node('Total')) + '\n');
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(el.querySelector('.clew-diagram-card')?.textContent).toBe('Drawing visual');
    expect(frame().classList.contains('is-drawing')).toBe(true);
    expect(run).not.toHaveBeenCalled();

    reply.appendText('```\nDone.');
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    expect(frame().classList.contains('is-drawing')).toBe(false);
    expect(frame().querySelector('.clew-figure-node')).not.toBeNull();
  });

  it('shows a figure past the fourth in a reply as code, with a note', async () => {
    reply.appendText([1, 2, 3, 4, 5].map((n) => '```figure\n' + figure(node(String(n))) + '\n```').join('\n\n'));
    reply.finish();
    await settle();
    expect(el.querySelectorAll('.clew-figure-node')).toHaveLength(4);
    expect(el.querySelector('.clew-figure-note')?.textContent).toBe('Only four figures are drawn per reply');
  });

  it('holds a live reply\'s repairable failure behind its drawing card until the reply ends', async () => {
    const live = new ReplyView(el = document.createElement('div'), markdown, hostOf(), undefined, true);
    live.appendText('```figure\n!Step 1: broken\n```\nMore ');
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await settle();
    expect(el.querySelector('.clew-figure-error')).toBeNull();
    expect(el.querySelector('.clew-reply-figure')!.classList.contains('is-drawing')).toBe(true);
    live.finish();
    expect(el.querySelector('.clew-figure-error-message')?.textContent).toBe('Step 1: broken');
  });

  it('draws a diagram whose source holds a fence line inside a longer fence, so the line stays source', async () => {
    reply.appendText('````mermaid\nflowchart LR\n  A["```"] --> B\n````\n');
    reply.finish();
    await Promise.resolve();
    expect(el.querySelector('.clew-diagram')!.textContent).toBe('````mermaid\nflowchart LR\n  A["```"] --> B\n````');
  });

  it('asks for diagrams in a Mermaid fence, never in prose or a figure', async () => {
    const asked: Array<[string, boolean | undefined]> = [];
    reply = new ReplyView(el = document.createElement('div'), {
      render: async (_target: HTMLElement, text: string, options?: { diagrams?: boolean }) => {
        asked.push([text.split('\n')[0]!, options?.diagrams]);
      },
      release: () => undefined,
      renderMath: () => document.createElement('span'),
      finishRenderMath: () => Promise.resolve(),
    }, hostOf());
    reply.appendText('Prose.\n\n```mermaid\nflowchart LR\n```\n\n```figure\n' + figure({ type: 'Text', props: { text: '**Inside** $x$' }, children: [] }) + '\n```\n');
    reply.finish();
    await settle();
    expect(asked).toEqual([['Prose.', undefined], ['```mermaid', true], ['**Inside** $x$', false]]);
  });

  it('renders each finished paragraph once while the next one streams', async () => {
    const rendered: string[] = [];
    reply = new ReplyView(el = document.createElement('div'), {
      render: async (target: HTMLElement, text: string) => {
        rendered.push(text);
        target.textContent = text;
      },
      release: () => undefined,
    } as unknown as MarkdownTarget, hostOf());
    const frame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));

    reply.appendText('First paragraph.\n\nSec');
    await frame();
    reply.appendText('ond, still');
    await frame();
    reply.appendText(' going.\nNot a new block');
    await frame();

    expect(rendered).toEqual([
      'First paragraph.\n\n',
      'Sec',
      'Second, still',
      'Second, still going.\nNot a new block',
    ]);
    expect(el.querySelector('.clew-reply-prose')!.textContent).toBe('First paragraph.\n\nSecond, still going.\nNot a new block');
  });

  it('adds one copy button when the reply ends, which copies the text as written', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    reply.appendText('Look at **line 3**.');
    tool('a', 'Read', 'done');
    reply.appendText('Then $x^2$.');
    reply.finish();
    reply.finish();

    const buttons = el.querySelectorAll<HTMLElement>('.clew-reply-copy');
    expect(buttons).toHaveLength(1);
    buttons[0]!.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('Look at **line 3**.\n\nThen $x^2$.');
    expect(buttons[0]!.classList.contains('is-copied')).toBe(true);
  });

  it('shows the time the turn ended at, left of the copy button', () => {
    reply.appendText('Done.');
    reply.finish(new Date(2024, 0, 5, 14, 30).getTime());

    const footer = el.querySelector('.clew-reply-footer')!;
    expect([...footer.children].map((child) => child.className.split(' ')[0])).toEqual(['clew-reply-time', 'clew-icon-action']);
    expect(footer.querySelector('.clew-reply-time')!.textContent).toMatch(/\d/);
  });

  it('shows no time for a turn saved without one', () => {
    reply.appendText('Done.');
    reply.finish();
    expect(el.querySelector('.clew-reply-time')).toBeNull();
  });

  describe('thumbs', () => {
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

    afterEach(() => {
      if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
      else Reflect.deleteProperty(window, 'matchMedia');
    });

    function rated(rating?: 'up' | 'down') {
      const given: Array<'up' | 'down' | undefined> = [];
      reply.appendText('Done.');
      reply.finish(undefined, { rating, rate: (next) => given.push(next) });
      const [up, down] = [...el.querySelectorAll<HTMLElement>('.clew-reply-rate')];
      return { up: up!, down: down!, given };
    }

    it('adds a thumb pair after the copy button when given feedback, lit as the turn was rated, and reports a press', () => {
      const { up, down, given } = rated('up');
      expect(el.querySelector('.clew-reply-copy')!.nextElementSibling).toBe(up);
      expect([up, down].map((thumb) => thumb.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
      down.click();
      expect(given).toEqual(['down']);
    });

    it('lights the pressed thumb and puts the other out', () => {
      const { up, down } = rated('down');
      up.click();
      expect(up.classList.contains('is-active')).toBe(true);
      expect(down.classList.contains('is-active')).toBe(false);
    });

    it('takes the thumb back when the lit one is pressed again', () => {
      const { up, given } = rated();
      up.click();
      up.click();
      expect(given).toEqual(['up', undefined]);
      expect(up.getAttribute('aria-pressed')).toBe('false');
    });

    it('animates clicks when selecting and clearing a thumb', () => {
      window.matchMedia = jest.fn().mockReturnValue({ matches: false });
      const { up } = rated();
      up.animate = jest.fn();
      up.click();
      up.click();
      expect(up.animate).toHaveBeenCalledTimes(2);
    });

    it('keeps the selected state without animation when reduced motion is preferred', () => {
      window.matchMedia = jest.fn().mockReturnValue({ matches: true });
      const { down } = rated();
      down.animate = jest.fn();
      down.click();
      expect(down.animate).not.toHaveBeenCalled();
      expect(down.classList.contains('is-active')).toBe(true);
    });
  });

  it('adds no thumbs without feedback', () => {
    reply.appendText('Done.');
    reply.finish();
    expect(el.querySelector('.clew-reply-rate')).toBeNull();
  });

  it('adds no copy button to a reply without text', () => {
    tool('a', 'Read', 'done');
    reply.finish();
    expect(el.querySelector('.clew-reply-copy')).toBeNull();
  });

  it('expands and collapses the list of calls from the summary line', () => {
    tool('a', 'Read', 'done');
    const group = el.querySelector<HTMLElement>('.clew-tools')!;
    const header = group.querySelector<HTMLElement>('.clew-tools-header')!;

    header.click();
    expect(group.classList.contains('is-open')).toBe(true);
    expect(header.getAttribute('aria-expanded')).toBe('true');

    header.click();
    expect(group.classList.contains('is-open')).toBe(false);
  });

  describe('stops the agent pointed at', () => {
    const stop = (quote: string, extra: Partial<{ comment: string; path: string }> = {}) => ({ path: 'a.md', quote, ...extra });
    const rows = () => Array.from(el.querySelectorAll<HTMLElement>('.clew-walk-step'));

    it('draws each stop where it was written, between the prose around it', () => {
      reply.appendText('Look here.');
      reply.highlight(stop('the slope', { comment: 'Missing factor' }));
      reply.appendText('Then this.');
      reply.highlight(stop('the intercept'));

      expect(Array.from(el.children).map((child) => child.className.split(' ')[0])).toEqual(['clew-reply-text', 'clew-walkthrough', 'clew-reply-text', 'clew-walkthrough']);
    });

    it('numbers stops across runs, shows the comment over a snippet of the quote, and a snippet alone when there is no comment', () => {
      reply.highlight(stop('the slope of a line', { comment: 'Missing factor' }));
      reply.appendText('More.');
      reply.highlight(stop('one two three four five six seven eight nine ten'));

      expect(rows().map((row) => row.textContent)).toEqual(['1Missing factorthe slope of a line', '2one two three four five six seven eight…']);
    });

    it('names the note only when it is not the first stop\'s note', () => {
      reply.highlight(stop('first', { comment: 'a' }));
      reply.highlight(stop('second', { comment: 'b', path: 'notes/Waves.md' }));

      expect(rows().map((row) => row.querySelector('.clew-walk-note')?.textContent)).toEqual([undefined, 'Waves']);
    });

    it('plays from the stop that was clicked, with every stop of the reply', () => {
      reply.highlight(stop('first'));
      reply.appendText('Between.');
      reply.highlight(stop('second'));
      reply.highlight(stop('third'));

      rows()[1]!.click();

      expect(host.picked).toEqual([[3, 1]]);
    });

    it('marks the stop on screen and the one that was missed, and clears them at rest', () => {
      const first = stop('first');
      const second = stop('second');
      reply.highlight(first);
      reply.highlight(second);

      host.listeners.forEach((listener) => listener({ step: first, state: 'playing' }));
      expect(rows().map((row) => row.classList.contains('is-active'))).toEqual([true, false]);
      host.listeners.forEach((listener) => listener({ step: second, state: 'missed' }));
      expect(rows().map((row) => [row.classList.contains('is-active'), row.classList.contains('is-missed')])).toEqual([[false, false], [false, true]]);
      host.listeners.forEach((listener) => listener(null));
      expect(rows().some((row) => row.classList.contains('is-active'))).toBe(false);
    });

    it('counts the stops before the one on screen as seen, across runs, and forgets them when it goes back', () => {
      const [a, b, c] = [stop('a'), stop('b'), stop('c')];
      reply.highlight(a);
      reply.appendText('Between.');
      reply.highlight(b);
      reply.highlight(c);
      const seen = () => rows().map((row) => row.classList.contains('is-seen'));

      host.listeners.forEach((listener) => listener({ step: c, state: 'playing' }));
      expect(seen()).toEqual([true, true, false]);
      host.listeners.forEach((listener) => listener({ step: b, state: 'playing' }));
      expect(seen()).toEqual([true, false, false]);
      host.listeners.forEach((listener) => listener(null));
      expect(seen()).toEqual([true, false, false]);
    });

    it('keeps stops out of the copied text', () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
      reply.appendText('The answer.');
      reply.highlight(stop('first', { comment: 'Look' }));
      reply.finish();

      el.querySelector<HTMLElement>('.clew-reply-copy')!.click();

      expect(writeText).toHaveBeenCalledWith('The answer.');
    });

    it('replaces the working line when the first stop arrives', () => {
      reply.thinking();
      reply.highlight(stop('first'));

      expect(Array.from(el.children).map((child) => child.className.split(' ')[0])).toEqual(['clew-walkthrough']);
    });
  });

  describe('a quiz in the reply', () => {
    const QUIZ = '```figure\n' + figure({ type: 'Quiz', props: { question: 'Pick the even number', options: ['3', '4'], correct: '4' }, children: [] }) + '\n```\n';

    function answer(accept: (message: string) => boolean) {
      const quizEl = document.createElement('div');
      const quizReply = new ReplyView(quizEl, markdown, hostOf(), (message) => accept(message));
      quizReply.appendText(QUIZ);
      quizReply.finish();
      return quizEl;
    }

    it('sends the answer to the chat as the student\'s next message', async () => {
      const sent: string[] = [];
      const quizEl = answer((message) => (sent.push(message), true));
      await settle();

      quizEl.querySelectorAll<HTMLElement>('.clew-quiz-option')[1]!.click();
      quizEl.querySelector<HTMLElement>('.clew-quiz-submit')!.click();

      expect(sent).toEqual(['My answer: 4 (correct). Question: Pick the even number']);
      expect(quizEl.querySelectorAll('.clew-quiz-option')[1]!.classList.contains('is-correct')).toBe(true);
    });

    it('stays open while the chat is busy', async () => {
      const quizEl = answer(() => false);
      await settle();

      quizEl.querySelectorAll<HTMLElement>('.clew-quiz-option')[0]!.click();
      quizEl.querySelector<HTMLElement>('.clew-quiz-submit')!.click();

      expect(quizEl.querySelector('.clew-quiz-submit')).not.toBeNull();
      expect(quizEl.querySelector('.clew-quiz-note')!.textContent).toMatch(/finish/i);
    });
  });

  it('does not draw a finished figure again while later text streams in', async () => {
    const run = jest.mocked(figureSandbox.run);
    run.mockClear();
    const streamEl = document.createElement('div');
    const streaming = new ReplyView(streamEl, markdown, hostOf());

    streaming.appendText('```figure\n' + figure(node('Total')) + '\n```\nFirst ');
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    streaming.appendText('and second');
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    expect(run).toHaveBeenCalledTimes(1);
  });
});
