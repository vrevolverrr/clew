/** @jest-environment jsdom */
import { library } from '@/renderer/openui/library';
import { OpenUIRenderer } from '@/renderer/openui/OpenUIRenderer';
import { PACKS } from '@/renderer/openui/packs';
import { figureKey } from '@/renderer/openui/steps/validation';

const renderers: OpenUIRenderer[] = [];
let frames: Map<number, FrameRequestCallback>;
let clock = 0;
let reduced = false;

beforeEach(() => {
  jest.useFakeTimers();
  frames = new Map();
  clock = 0;
  reduced = false;
  let serial = 0;
  jest.spyOn(performance, 'now').mockImplementation(() => clock);
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++serial, callback); return serial; });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => ({ matches: reduced })) });
});

afterEach(() => {
  renderers.splice(0).forEach(r => r.destroy());
  expect(frames.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
  document.body.replaceChildren();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function render(program: string) {
  const host = document.body.appendChild(document.createElement('div'));
  const renderer = new OpenUIRenderer(host, library, (el, markdown) => { el.textContent = markdown; });
  renderers.push(renderer);
  renderer.set(program, true);
  return { host, renderer };
}

function q<T extends HTMLElement = HTMLElement>(host: HTMLElement, selector: string): T { return host.querySelector(selector)! as T; }
function click(host: HTMLElement, name: string) { q<HTMLButtonElement>(host, `[aria-label="${name}"]`).click(); }
function seek(host: HTMLElement, value: number) {
  const range = q<HTMLInputElement>(host, 'input[type=range]');
  range.value = String(value);
  range.dispatchEvent(new Event('input', { bubbles: true }));
}
function frame(time: number) {
  clock = time;
  const queued = [...frames.values()];
  frames.clear();
  queued.forEach(callback => callback(time));
}

const board = 'Board([{id: "left", label: "Left", slots: 2}, {id: "right", label: "Right", slots: 2}], [Step("Arrive", "A > left"), Step("Copy", "A >> right"), Step("Move", "A > right:1; A ~ done"), Step("Leave", "-A")])';
const program = `$s = 0\nroot = Stack([b, Slider("Other", 0, 2, 1, $s)])\nb = ${board}`;

describe('snapshot figures through the production parser', () => {
  it('plays the pack examples to the end', () => {
    for (const name of ['board', 'network'] as const) {
      const { host, renderer } = render(PACKS[name].example);
      expect(renderer.errors).toEqual([]);
      expect(q(host, '.clew-caption').textContent).toBeTruthy();
      click(host, 'Play');
      jest.advanceTimersByTime(2400);
      frame(2600);
      expect(q(host, '.clew-player-count').textContent).toBe('4 / 4');
    }
  });

  it('owns playback independently, pauses navigation, restarts at the end, and handles Space', () => {
    const { host } = render(`root = Stack([${board}, ${board}])`);
    const figures = [...host.querySelectorAll<HTMLElement>('.clew-board')];
    click(figures[0], 'Play');
    jest.advanceTimersByTime(800);
    expect(q(figures[0], '.clew-player-count').textContent).toBe('2 / 4');
    expect(q(figures[1], '.clew-player-count').textContent).toBe('1 / 4');
    click(figures[0], 'Back');
    jest.advanceTimersByTime(1600);
    expect(q(figures[0], '.clew-player-count').textContent).toBe('1 / 4');
    seek(figures[0], 3);
    q(figures[0], 'input').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', cancelable: true }));
    expect(q(figures[0], '.clew-player-count').textContent).toBe('1 / 4');
    jest.advanceTimersByTime(2400);
    expect(q(figures[0], '[aria-label="Play"]')).toBeTruthy();
    expect(q(figures[0], '.clew-player-count').textContent).toBe('4 / 4');
  });

  it('preserves position, play state and elements on unrelated redraws and resets on changed content', () => {
    const { host, renderer } = render(program);
    const original = q(host, '[data-block="A"]');
    click(host, 'Play');
    jest.advanceTimersByTime(800);
    const slider = q<HTMLInputElement>(host, '.clew-slider input');
    slider.value = '1';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(q(host, '.clew-player-count').textContent).toBe('2 / 4');
    expect(q(host, '[aria-label="Pause"]')).toBeTruthy();
    expect(q(host, '[data-block="A"]')).toBe(original);
    renderer.set(program.replace('"Copy"', '"A new caption"'), true);
    expect(q(host, '.clew-player-count').textContent).toBe('1 / 4');
    expect(q(host, '[aria-label="Play"]')).toBeTruthy();
    expect(frames.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('animates new copies from a prior visible source and retains moving elements', () => {
    const { host } = render(`root = Stack([${board}])`);
    const original = q(host, '[data-block="A"]');
    const origin = original.style.transform;
    click(host, 'Next');
    const copy = q(host, '[data-block="A_copy"]');
    expect(copy.style.transform).toBe(origin);
    frame(100);
    const halfway = copy.style.transform;
    expect(halfway).not.toBe(origin);
    frame(200);
    expect(copy.style.transform).not.toBe(halfway);
    click(host, 'Next');
    expect(q(host, '[data-block="A"]')).toBe(original);
    expect(original.textContent).toBe('✓ A');
    expect(q(host, '.clew-caption').textContent).toBe('Move');
    frame(400);
    expect(original.style.transform).not.toBe(origin);
  });

  it('continues interrupted forward movement from the displayed position and rejects stale callbacks', () => {
    const { host } = render('root = Stack([Board([{id:"r", label:"R", slots:4}], [Step("0", "A > r:0"), Step("1", "A > r:1"), Step("2", "A > r:2"), Step("3", "A > r:3")])])');
    click(host, 'Next');
    frame(100);
    const element = q(host, '[data-block="A"]');
    const halfway = element.style.transform;
    const stale = [...frames.values()][0];
    click(host, 'Next');
    expect(element.style.transform).toBe(halfway);
    frame(200);
    const latest = element.style.transform;
    stale(500);
    expect(element.style.transform).toBe(latest);
    seek(host, 0);
    const snapped = element.style.transform;
    frame(600);
    expect(element.style.transform).toBe(snapped);
    expect(frames.size).toBe(0);
  });

  it('snaps seeks, reverse steps and reduced motion, including copies with no previous source', () => {
    const { host } = render(`root = Stack([${board}])`);
    seek(host, 2);
    expect(frames.size).toBe(0);
    click(host, 'Back');
    expect(frames.size).toBe(0);
    reduced = true;
    click(host, 'Next');
    expect(frames.size).toBe(0);
    const second = render('root = Stack([Board([{id:"r",label:"R",slots:2}], [Step("Empty",""), Step("Both","A > r:0; A >> r:1")])])').host;
    reduced = false;
    click(second, 'Next');
    expect(frames.size).toBe(0);
    expect(q(second, '[data-block="A_copy"]').style.transform).not.toBe(q(second, '[data-block="A"]').style.transform);
  });

  it('validates later steps before drawing, shows the error in place, and leaves siblings usable', () => {
    const { host, renderer } = render(`root = Stack([Board([{id:"r",label:"R",slots:1}], [Step("Valid","A > r"), Step("Invalid","B > r")]), ${board}])`);
    const first = q(host, '.clew-stack').firstElementChild!;
    expect(first.className).toBe('clew-visual-error');
    expect(first.textContent).toBe('Board: Step 2: full region r');
    expect(renderer.errors).toEqual(['Board: Step 2: full region r']);
    expect(host.querySelectorAll('.clew-board')).toHaveLength(1);
    click(host, 'Next');
    expect(q(host, '.clew-player-count').textContent).toBe('2 / 4');
  });

  it.each([
    ['Board', 'Board([{id:"r",label:"R",slots:2}], [Step("Put **A** in", "A > r")])'],
    ['Network', 'Network([{id:"A"}], [], [Step("Visit **A**", [Show("A")])])'],
  ])('draws a %s caption through the Markdown renderer', (_name, figure) => {
    const host = document.body.appendChild(document.createElement('div'));
    const renderer = new OpenUIRenderer(host, library, (el, markdown) => { el.innerHTML = markdown.replace(/\*\*(.+?)\*\*/, '<strong>$1</strong>'); });
    renderers.push(renderer);
    renderer.set(`root = Stack([${figure}])`, true);
    expect(q(host, '.clew-caption strong').textContent).toBe('A');
  });

  it('invalidates unknown operations through the production parser', () => {
    const host = document.body.appendChild(document.createElement('div'));
    const renderer = new OpenUIRenderer(host, library, (el, markdown) => { el.textContent = markdown; });
    renderers.push(renderer);
    renderer.set('root = Stack([Network([{id:"A"}], [], [Step("Bad", [Unknown("A")])])])', true);
    expect(q(host, '.clew-visual-error').textContent).toBe('Network: unknown component Unknown');
    expect(host.querySelector('.clew-network')).toBeNull();
  });

  it.each([
    'Board([{id:"r",label:"R",slots:"2"}], [Step("Bad", "")])',
    'Board([{id:"r",label:"R",slots:2,cols:"2"}], [Step("Bad", "")])',
    'Board([{id:"r",label:"R",slots:2,cols:null}], [Step("Bad", "")])',
    'Board([], [Step("Bad", "", "extra")])',
    'Board([], [Step("Bad", "")], "extra")',
    'Network([{id:"A",hidden:1}], [], [Step("Bad",[])])',
    'Network([{id:"A"}], [], [Step("Bad",[Tag("A","done","extra")])])',
    'Network([{id:"A"}], [], [Step("Bad",[Label("A",2)])])',
    'Network([{id:"A"}], [], [Step("Bad",[Show()])])',
    'Board(missing, [Step("Bad", "")])',
  ])('retains invalid arguments for the parent to reject: %s', invalid => {
    const { host } = render(`root = Stack([${invalid}, Stat("Sibling", 7)])`);
    expect(q(host, '.clew-visual-error').textContent).toBeTruthy();
    expect(host.querySelector('.clew-step-figure')).toBeNull();
    expect(q(host, '.clew-stat').textContent).toContain('7');
  });

  it('preserves references, variables, expressions and functions alongside figures', () => {
    const { host, renderer } = render('$n = 2\nplaces = [{id:"r",label:"Place",slots:$n}]\nfirst = Step("First", "A > r")\nops = [Tag("A", "done")]\nroot = Stack([Board(places,[first]), Network([{id:"A"}],[],[Step("Tagged",ops)]), Stat("Value", @Eval("n + 3", {n:$n}))])');
    expect(renderer.errors).toEqual([]);
    expect(q(host, '[data-node="A"]').textContent).toBe('✓ A');
    expect(q(host, '.clew-stat').textContent).toContain('5');
  });

  it('handles streamed prefixes and rejects cyclic references locally', () => {
    const { host, renderer } = render('root = Stack([Board([], [Step("Empty", "")])])');
    expect(() => renderer.set('root = Stack([Board(', false)).not.toThrow();
    renderer.set('places = places\nroot = Stack([Board(places,[Step("Bad","")]),Stat("Other",1)])', true);
    expect(q(host, '.clew-visual-error').textContent).toBe('Board: cyclic reference places');
    expect(q(host, '.clew-stat').textContent).toContain('1');
  });

  it('disables one-step controls and announces only the current caption as text', () => {
    const { host } = render('root = Stack([Board([], [Step("<img src=x onerror=alert(1)>", "")])])');
    for (const control of host.querySelectorAll<HTMLInputElement>('button,input')) expect(control.disabled).toBe(true);
    expect(host.querySelector('img')).toBeNull();
    expect(q(host, '[aria-live]').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(q(host, '.clew-caption-sizes').getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps graph geometry fixed across hidden-state changes and relabeling', () => {
    const { host } = render(PACKS.network.example);
    const original = [...host.querySelectorAll<HTMLElement>('[data-node]')].map(n => n.style.transform);
    const paths = [...host.querySelectorAll<SVGElement>('[data-edge]')].map(n => n.getAttribute('d'));
    const hub = q(host, '[data-node="H"]');
    expect(hub.hidden).toBe(true);
    expect(q(host, '[data-edge="extension"]').style.display).toBe('none');
    seek(host, 2);
    expect(hub.hidden).toBe(false);
    expect(q(host, '[data-edge="extension"]').style.display).toBe('');
    expect([...host.querySelectorAll<HTMLElement>('[data-node]')].map(n => n.style.transform)).toEqual(original);
    expect([...host.querySelectorAll<SVGElement>('[data-edge]')].map(n => n.getAttribute('d'))).toEqual(paths);
    expect(new Set(paths.slice(0, 3)).size).toBe(3);
    seek(host, 0);
    expect(hub.hidden).toBe(true);
  });

  it('stops autoplay and animation when dropped or destroyed', () => {
    const { host, renderer } = render(`root = Stack([${board}])`);
    click(host, 'Play');
    jest.advanceTimersByTime(800);
    expect(frames.size).toBe(1);
    renderer.set('root = Stack([TextContent("Gone")])', true);
    expect(frames.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('canonicalizes object key order and enforces exact serialized UTF-8 limits', () => {
    expect(figureKey({ b: 2, a: { d: 4, c: 3 } })).toBe(figureKey({ a: { c: 3, d: 4 }, b: 2 }));
    expect(figureKey({ x: 'a'.repeat(262136) }).length).toBe(262144);
    expect(() => figureKey({ x: 'a'.repeat(262137) })).toThrow('256 KiB');
    expect(() => figureKey({ x: 'é'.repeat(131069) })).toThrow('256 KiB');
  });
});
