/**
 * @jest-environment jsdom
 */
import { library } from '@/renderer/openui/library';
import { OpenUIRenderer } from '@/renderer/openui/OpenUIRenderer';

function render(program: string) {
  const host = document.body.appendChild(document.createElement('div'));
  const renderer = new OpenUIRenderer(host, library, () => undefined);
  const result = renderer.set(program, true);
  return { host, renderer, result };
}

const q = <T extends HTMLElement>(host: HTMLElement, selector: string) => host.querySelector<T>(selector)!;
const figure = (host: HTMLElement) => q(host, '.clew-stat-value').textContent;

function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => {
  jest.useRealTimers();
  document.body.replaceChildren();
});

describe('Stat', () => {
  it('prints a number without float noise and marks a pass or a fail', () => {
    const { host, result } = render('root = Stack([Stat("Sum", 0.1 + 0.2, "good")])');

    expect(result.meta.errors).toEqual([]);
    expect(figure(host)).toBe('✓0.3');
    expect(q(host, '.clew-stat-mark').getAttribute('aria-label')).toBe('passes');
  });

  it('follows a variable through a conditional status', () => {
    const { host } = render('$k = 5\nroot = Stack([Slider("k", 0, 10, 1, $k), Stat("k", $k, $k > 6 ? "good" : "bad")])');
    expect(figure(host)).toBe('✕5');

    type(q(host, 'input[type=range]'), '8');

    expect(figure(host)).toBe('✓8');
  });

  it('sets a long string as text, not as a headline figure', () => {
    const { host } = render('root = Stack([Stat("Held", "{(1,y), (4,t), (2,a)}"), Stat("Count", 3), Stat("Body", "Moon")])');
    const [held, count, body] = [...host.querySelectorAll('.clew-stat')].map((el) => el.classList.contains('is-text'));

    expect([held, count, body]).toEqual([true, false, false]);
  });
});

describe('Slider', () => {
  it('fills its track up to the value, following the student', () => {
    const { host } = render('$v = 10\nroot = Stack([Slider("Speed", 0, 40, 1, $v)])');
    const input = q<HTMLInputElement>(host, 'input[type=range]');
    expect(input.style.getPropertyValue('--clew-progress')).toBe('25%');

    type(input, '30');

    expect(input.style.getPropertyValue('--clew-progress')).toBe('75%');
  });

  it('writes its variable on input and shows the value with its unit', () => {
    const { host } = render('$v = 22\nroot = Stack([Slider("Speed", 5, 40, 1, $v, "m/s"), Stat("Doubled", $v * 2)])');
    const input = q<HTMLInputElement>(host, 'input[type=range]');
    expect(q(host, '.clew-slider output').textContent).toBe('22 m/s');
    expect(input.min).toBe('5');
    expect(input.max).toBe('40');

    type(input, '30');

    expect(host.querySelector('input[type=range]')).toBe(input);
    expect(q(host, '.clew-slider output').textContent).toBe('30 m/s');
    expect(figure(host)).toBe('60');
  });

  it('keeps the position the student chose when given a literal', () => {
    const { host } = render('root = Stack([Slider("Speed", 5, 40, 1, 22)])');
    const input = q<HTMLInputElement>(host, 'input[type=range]');

    type(input, '30');

    expect(input.value).toBe('30');
    expect(q(host, '.clew-slider output').textContent).toBe('30');
  });
});

describe('Choice', () => {
  const program = '$body = "Earth"\nroot = Stack([Choice("Gravity", ["Earth", "Moon", "Mars"], $body), Stat("Chosen", $body)])';

  it('marks the bound option and writes the one clicked, keeping the same buttons', () => {
    const { host } = render(program);
    const buttons = [...host.querySelectorAll<HTMLElement>('.clew-choice-option')];
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);

    buttons[2]!.click();

    expect([...host.querySelectorAll('.clew-choice-option')]).toEqual(buttons);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect(figure(host)).toBe('Mars');
  });
});

describe('TextInput', () => {
  it('writes each keystroke to its variable and keeps the same field', () => {
    const { host } = render('$w = "kitten"\nroot = Stack([TextInput("From", $w, 8), Stat("Typed", $w)])');
    const input = q<HTMLInputElement>(host, 'input[type=text]');
    expect(input.value).toBe('kitten');
    expect(input.maxLength).toBe(8);

    type(input, 'sitting');

    expect(host.querySelector('input[type=text]')).toBe(input);
    expect(input.value).toBe('sitting');
    expect(figure(host)).toBe('sitting');
  });
});

describe('Player', () => {
  const program = '$s = 0\nroot = Stack([Player(3, $s, 500), Stat("Step", $s)])';

  it('steps with Next and Back and stops at both ends', () => {
    const { host } = render(program);
    const back = q(host, '[aria-label="Back"]');
    const next = q(host, '[aria-label="Next"]');

    back.click();
    expect(figure(host)).toBe('0');
    next.click();
    next.click();
    expect(figure(host)).toBe('2');
    expect(q(host, '.clew-player-count').textContent).toBe('2 / 3');
    next.click();
    next.click();
    expect(figure(host)).toBe('3');
  });

  it('plays one step per interval, stops at the end, and starts over from there', () => {
    jest.useFakeTimers();
    const { host } = render(program);
    const play = q(host, '[aria-label="Play"]');

    play.click();
    expect(play.getAttribute('aria-label')).toBe('Pause');
    jest.advanceTimersByTime(499);
    expect(figure(host)).toBe('0');
    jest.advanceTimersByTime(1);
    expect(figure(host)).toBe('1');
    jest.advanceTimersByTime(1000);
    expect(figure(host)).toBe('3');
    expect(play.getAttribute('aria-label')).toBe('Play');
    jest.advanceTimersByTime(5000);
    expect(figure(host)).toBe('3');

    play.click();
    jest.advanceTimersByTime(500);
    expect(figure(host)).toBe('1');
  });

  it('pauses on a second press', () => {
    jest.useFakeTimers();
    const { host } = render(program);
    const play = q(host, '[aria-label="Play"]');

    play.click();
    jest.advanceTimersByTime(500);
    play.click();
    jest.advanceTimersByTime(5000);

    expect(figure(host)).toBe('1');
    expect(play.getAttribute('aria-label')).toBe('Play');
  });

  it('stops its timer when the renderer is destroyed', () => {
    jest.useFakeTimers();
    const { host, renderer } = render(program);
    q(host, '[aria-label="Play"]').click();

    renderer.destroy();

    expect(jest.getTimerCount()).toBe(0);
  });

  it('plays and pauses with Space on the scrubber', () => {
    jest.useFakeTimers();
    const { host } = render(program);
    const range = q(host, '.clew-player input[type=range]');
    const press = () => range.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

    press();
    jest.advanceTimersByTime(500);
    press();
    jest.advanceTimersByTime(5000);

    expect(figure(host)).toBe('1');
  });

  it('honours a fractional step', () => {
    jest.useFakeTimers();
    const { host } = render('$t = 0\nroot = Stack([Player(1, $t, 100, 0.25), Stat("t", $t)])');

    q(host, '[aria-label="Play"]').click();
    jest.advanceTimersByTime(300);

    expect(figure(host)).toBe('0.75');
  });
});

describe('Grid', () => {
  const program = `$s = 0
root = Stack([Grid(["", "x", "y"], ["", "a", "b"], [[0, 1, 2], [1, 5, 6], [2, 7, 8]], $s, 3, ["start", "first", "second", "third"], [[[0, 0]], [[0, 1], [1, 0]], []]), Player(3, $s, 500)])`;
  const renderGrid = (source: string) => {
    const host = document.body.appendChild(document.createElement('div'));
    const renderer = new OpenUIRenderer(host, library, (el, markdown) => { el.textContent = markdown; });
    const result = renderer.set(source, true);
    return { host, renderer, result };
  };
  const cell = (host: HTMLElement, row: number, col: number) => host.querySelectorAll('[role=row]')[row + 1]!.querySelectorAll('[role=gridcell]')[col]!;
  const next = (host: HTMLElement) => q(host, '[aria-label="Next"]').click();
  const filled = (host: HTMLElement) => [...host.querySelectorAll('[role=gridcell]')].map((td) => td.textContent);

  it('draws the labels and shows only the base cells before the first step', () => {
    const { host, result } = renderGrid(program);

    expect(result.meta.errors).toEqual([]);
    expect([...host.querySelectorAll('[role=columnheader]')].map((th) => th.textContent)).toEqual(['', '', 'x', 'y']);
    expect([...host.querySelectorAll('[role=rowheader]')].map((th) => th.textContent)).toEqual(['', 'a', 'b']);
    expect(filled(host)).toEqual(['0', '1', '2', '', '', '', '', '', '']);
    expect(host.querySelector('.is-new')).toBeNull();
    expect(q(host, '.clew-caption').textContent).toBe('start');
  });

  it('fills one cell a step in reading order, outlining the newest and shading what it came from', () => {
    const { host } = renderGrid(program);

    next(host);
    expect(filled(host)).toEqual(['0', '1', '2', '1', '', '', '', '', '']);
    expect(cell(host, 1, 0).classList.contains('is-new')).toBe(true);
    expect([...host.querySelectorAll('.is-source')]).toEqual([cell(host, 0, 0)]);
    expect(q(host, '.clew-caption').textContent).toBe('first');

    next(host);
    expect(cell(host, 1, 1).classList.contains('is-new')).toBe(true);
    expect(cell(host, 1, 0).classList.contains('is-new')).toBe(false);
    expect([...host.querySelectorAll('.is-source')]).toEqual([cell(host, 0, 1), cell(host, 1, 0)]);
  });

  it('fills the whole table at the last step, with no shading when a step lists no sources', () => {
    const { host } = renderGrid(program);

    next(host);
    next(host);
    next(host);

    expect(filled(host)).toEqual(['0', '1', '2', '1', '5', '6', '', '', '']);
    expect(host.querySelectorAll('.is-source')).toHaveLength(0);
  });

  it('draws a table with no variable bound, showing the base cells', () => {
    const { host } = renderGrid('root = Stack([Grid(["x"], ["a"], [[1]], 0, 1, [], [])])');

    expect(filled(host)).toEqual(['1']);
  });

  it('keeps future captions out of announcements and clears the caption on an empty step', () => {
    const { host } = renderGrid(program.replace('["start", "first", "second", "third"]', '["", "Future explanation", "", ""]'));
    const announcement = q(host, '[aria-live="polite"]');
    const reserved = q(host, '[aria-hidden="true"]');

    expect(announcement.textContent).toBe('');
    expect(reserved.textContent).toBe('Future explanation');
    expect(announcement.closest('[aria-hidden="true"]')).toBeNull();
    next(host);
    expect(announcement.textContent).toBe('Future explanation');
    next(host);
    expect(announcement.textContent).toBe('');
    expect(reserved.textContent).toBe('Future explanation');
  });

  it('refreshes the reserved captions when their text changes', () => {
    const { host, renderer } = renderGrid(program);
    next(host);

    renderer.set(program.replace('"first"', '"Updated explanation"').replace('"third"', '"A much longer final explanation"'), true);

    expect(q(host, '[aria-live="polite"]').textContent).toBe('Updated explanation');
    const reserved = q(host, '[aria-hidden="true"]').textContent;
    expect(reserved).toContain('Updated explanation');
    expect(reserved).toContain('A much longer final explanation');
    expect(reserved).not.toContain('third');
    renderer.destroy();
  });
});

