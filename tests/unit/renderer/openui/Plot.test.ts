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

const all = (host: HTMLElement, selector: string) => [...host.querySelectorAll<SVGElement>(selector)];
const ticks = (host: HTMLElement) => all(host, '.clew-plot-tick').map((el) => el.textContent);
const subpaths = (path: Element) => (path.getAttribute('d') ?? '').split('M').filter(Boolean).length;

afterEach(() => {
  jest.useRealTimers();
  delete (window as { matchMedia?: unknown }).matchMedia;
  document.body.replaceChildren();
});

const SLIDING = '$a = 1\nroot = Stack([Slider("a", 0, 3, 1, $a), Plot([0, 1], [Line(@Curve("a * x", 0, 1, {a: $a}), "ax")], [0, 3])])';
const curve = (host: HTMLElement) => host.querySelector('.clew-plot-line')!.getAttribute('d');

function slideTo(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('input[type=range]')!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Plot when its data changes', () => {
  it.each([[0.8, 0.4], [0.4, 0.8], [-0.8, -0.4], [-0.4, -0.8]])(
    'keeps the plot aligned while its automatic range animates from %s to %s',
    (from, to) => {
      jest.useFakeTimers();
      const program = (a: number) => `$a = ${a}\nroot = Stack([Slider("a", -1, 1, 0.1, $a), Plot([0, 1], [Line(@Curve("a * x", 0, 1, {a: $a}), "ax")])])`;
      const { host, renderer, result } = render(program(from));
      const target = render(program(to));
      expect(result.meta.errors).toEqual([]);
      expect(target.result.meta.errors).toEqual([]);
      const bounds = () => {
        const rect = host.querySelector('clipPath rect')!;
        return [rect.getAttribute('x'), rect.getAttribute('width')];
      };
      const initial = bounds();

      slideTo(host, String(to));
      for (let frame = 0; frame < 125; frame++) {
        jest.advanceTimersByTime(16);
        expect(bounds()).toEqual(initial);
      }

      expect(curve(host)).toBe(curve(target.host));
      renderer.destroy();
      target.renderer.destroy();
    },
  );

  it('moves the curve to its new data over a few frames instead of jumping', () => {
    jest.useFakeTimers();
    const { host } = render(SLIDING);
    const start = curve(host);
    const arrived = curve(render(SLIDING.replace('$a = 1', '$a = 3')).host);
    expect(start).not.toBe(arrived);

    slideTo(host, '3');
    expect(curve(host)).toBe(start);
    jest.advanceTimersByTime(48);
    const midway = curve(host);
    expect(midway).not.toBe(start);
    expect(midway).not.toBe(arrived);
    expect(host.querySelector('.clew-plot-hit')).toBeNull();

    jest.advanceTimersByTime(2000);
    expect(curve(host)).toBe(arrived);
    expect(host.querySelector('.clew-plot-hit')).not.toBeNull();
  });

  it('keeps chasing the newest value when the slider moves again before it arrives', () => {
    jest.useFakeTimers();
    const { host } = render(SLIDING);
    const arrived = curve(render(SLIDING.replace('$a = 1', '$a = 2')).host);

    slideTo(host, '3');
    jest.advanceTimersByTime(32);
    slideTo(host, '2');
    jest.advanceTimersByTime(2000);

    expect(curve(host)).toBe(arrived);
  });

  it('jumps at once when the student prefers reduced motion', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
    jest.useFakeTimers();
    const { host } = render(SLIDING);
    const arrived = curve(render(SLIDING.replace('$a = 1', '$a = 3')).host);

    slideTo(host, '3');

    expect(curve(host)).toBe(arrived);
  });

  it('stops moving when the renderer is destroyed', () => {
    jest.useFakeTimers();
    const { host, renderer } = render(SLIDING);
    slideTo(host, '3');
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    renderer.destroy();

    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('Plot', () => {
  it('draws a line through its points inside axes with round ticks', () => {
    const { host, result } = render('root = Stack([Plot([0, 10], [Line([[0, 0], [5, 5], [10, 10]])], [0, 10])])');

    expect(result.meta.errors).toEqual([]);
    const [line] = all(host, '.clew-plot-line');
    expect(line!.getAttribute('d')!.match(/L/g)).toHaveLength(2);
    expect(ticks(host)).toEqual(expect.arrayContaining(['0', '2', '4', '6', '8', '10']));
  });

  it('breaks a line where the function is undefined', () => {
    const { host } = render('root = Stack([Plot([-1, 1], [Line(@Curve("sqrt(x)", -1, 1))], [0, 1])])');

    const [line] = all(host, '.clew-plot-line');
    expect(line!.getAttribute('d')).toBeTruthy();
    expect(subpaths(line!)).toBe(1);

    const gap = render('root = Stack([Plot([-1, 1], [Line(@Curve("1 / x", -1, 1))], [-5, 5])])');
    const lines = all(gap.host, '.clew-plot-line');
    expect(lines.length).toBe(2);
  });

  it('gives each labelled layer its own colour and lists the labels', () => {
    const { host } = render('root = Stack([Plot([0, 1], [Line([[0, 0], [1, 1]], "rises"), Line([[0, 1], [1, 0]], "falls"), Line([[0, 0.5], [1, 0.5]], "flat", 1)])])');

    const colors = all(host, '.clew-plot-line').map((el) => el.getAttribute('stroke'));
    expect(colors).toEqual(['var(--clew-series-1)', 'var(--clew-series-2)', 'var(--clew-series-1)']);
    expect([...host.querySelectorAll('.clew-plot-key')].map((el) => el.textContent)).toEqual(['rises', 'falls', 'flat']);
  });

  it('shades an area down to its baseline and marks a dot and a rule', () => {
    const { host } = render('root = Stack([Plot([0, 10], [Area([[0, 2], [10, 4]], "tail", 2), Dot(5, 3, "mid"), Rule(7, "x", "limit"), Rule(1, "y")], [0, 5])])');

    expect(host.querySelector('.clew-plot-area')!.getAttribute('d')).toMatch(/Z$/);
    expect(host.querySelector('.clew-plot-dot')).not.toBeNull();
    expect(all(host, '.clew-plot-label').map((el) => el.textContent)).toEqual(expect.arrayContaining(['mid', 'limit']));
    expect(all(host, '.clew-plot-rule')).toHaveLength(2);
  });

  it('stands a waterfall on running totals', () => {
    const { host } = render('root = Stack([Plot(["Revenue", "Cost", "Profit"], [Bars([100, -30, null], "waterfall")])])');

    const bars = all(host, '.clew-plot-bar').map((el) => [el.getAttribute('data-from'), el.getAttribute('data-to')]);
    expect(bars).toEqual([['0', '100'], ['100', '70'], ['0', '70']]);
    expect(all(host, '.clew-plot-label').map((el) => el.textContent)).toEqual(['100', '−30', '70']);
    expect(all(host, '.clew-plot-bar').map((el) => el.getAttribute('fill'))).toEqual(['var(--clew-series-1)', 'var(--color-red)', 'var(--clew-series-1)']);
    expect(ticks(host)).toEqual(expect.arrayContaining(['Revenue', 'Cost', 'Profit']));
  });

  it('wraps category names to their slot and tilts them only when a word will not fit', () => {
    const roomy = render('root = Stack([Plot(["Revenue", "Operating expenditure", "Tax", "Net"], [Bars([3, 4, 5, 6])])])');
    const crowded = render('root = Stack([Plot(["Revenue", "Cost of goods", "Gross profit", "Operating expenses", "Depreciation", "Interest", "Tax", "Net income"], [Bars([1, 2, 3, 4, 5, 6, 7, 8])])])');

    expect(all(roomy.host, 'text[transform]')).toHaveLength(0);
    expect(ticks(roomy.host)).toEqual(expect.arrayContaining(['Operating', 'expenditure']));
    const tilted = all(crowded.host, 'text[transform]');
    expect(tilted).toHaveLength(8);
    expect(tilted.map((el) => el.textContent)).toContain('Operating expenses'.slice(0, 13) + '…');
  });

  it('draws plain bars from the baseline in one series colour', () => {
    const { host } = render('root = Stack([Plot(["A", "B"], [Bars([3, -2], "bars", "score")])])');

    expect(all(host, '.clew-plot-bar').map((el) => [el.getAttribute('data-from'), el.getAttribute('data-to'), el.getAttribute('fill')])).toEqual([
      ['0', '3', 'var(--clew-series-1)'],
      ['0', '-2', 'var(--clew-series-1)'],
    ]);
  });

  it('shows the values under the pointer in a tooltip, and hides it on leaving', () => {
    const { host } = render('root = Stack([Plot([0, 10], [Line([[0, 0], [5, 10], [10, 20]], "growth")], [0, 20])])');
    const overlay = [...host.querySelectorAll<SVGElement>('.clew-plot-hit')].at(-1)!;
    const tip = host.querySelector<HTMLElement>('.clew-plot-tip')!;
    expect(tip.hidden).toBe(true);

    // 480 px wide with a 56 px left margin and 20 px right, so x = 5 sits at 56 + 404 / 2.
    overlay.dispatchEvent(new MouseEvent('pointermove', { clientX: 258, bubbles: true }));

    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('5growth: 10');
    overlay.dispatchEvent(new MouseEvent('pointerleave'));
    expect(tip.hidden).toBe(true);
  });

  it('writes a model\'s labels as text, never as markup', () => {
    const { host } = render('root = Stack([Plot([0, 1], [Line([[0, 0], [1, 1]], "<img src=x onerror=alert(1)>"), Note(0.5, 0.5, "<b>hi</b>")])])');

    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('b')).toBeNull();
    expect(host.querySelector('.clew-plot-key')!.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('draws bare axes for a plot with no layers and tolerates a layer with no points', () => {
    const { host } = render('root = Stack([Plot([0, 1], [Line([])])])');

    expect(host.querySelector('.clew-plot-svg')).not.toBeNull();
    expect(all(host, '.clew-plot-line')).toHaveLength(0);
  });

  it('fits the vertical range to the data when none is given', () => {
    const { host } = render('root = Stack([Plot([0, 1], [Line([[0, 100], [1, 200]])])])');

    const values = ticks(host).map((t) => Number(t)).filter((n) => !Number.isNaN(n));
    expect(Math.min(...values)).toBeLessThanOrEqual(100);
    expect(Math.max(...values)).toBeGreaterThanOrEqual(200);
  });

  it('keeps zero as the floor for data that never goes below it', () => {
    const { host } = render('root = Stack([Plot([0, 1], [Area([[0, 2], [1, 7]])])])');

    const values = ticks(host).map((t) => Number(t)).filter((n) => !Number.isNaN(n));
    expect(Math.min(...values)).toBe(0);
  });

  it('shades between two curves, and only over from and to when they are given', () => {
    const { host } = render('hi = [[0, 3], [4, 3]]\nlo = [[0, 1], [4, 1]]\nroot = Stack([Plot([0, 4], [Area(hi, "gap", 1, lo, 1, 3)], [0, 4])])');

    const shade = host.querySelector('.clew-plot-area')!;
    const corners = (shade.getAttribute('d') ?? '').split(/[ML]/).filter(Boolean).map((c) => c.replace('Z', '').split(',').map(Number));
    expect(corners).toHaveLength(4);
    expect(new Set(corners.map(([, y]) => y)).size).toBe(2);

    const id = shade.parentElement!.getAttribute('clip-path')!.slice('url(#'.length, -1);
    const rect = host.querySelector(`[id="${id}"] rect`)!;
    const axis = host.querySelector('.clew-plot-axis')!;
    const plotWidth = Number(axis.getAttribute('x2')) - Number(axis.getAttribute('x1'));
    expect(Number(rect.getAttribute('width'))).toBeCloseTo(plotWidth / 2, 0);
  });

  it('shades the whole x range between two curves when from and to are left out', () => {
    const { host } = render('root = Stack([Plot([0, 4], [Area([[0, 3], [4, 3]], "gap", 1, [[0, 1], [4, 1]])], [0, 4])])');

    const shade = host.querySelector('.clew-plot-area')!;
    expect(shade.parentElement!.getAttribute('clip-path')).toMatch(/^url\(#clew-plot-clip-\d+\)$/);
    expect(shade.getAttribute('d')).toMatch(/Z$/);
  });

  it('lists lines, areas and bars in the legend but not a dot or a rule, which label themselves', () => {
    const { host } = render('root = Stack([Plot([0, 1], [Line([[0, 0], [1, 1]], "curve"), Dot(0.5, 0.5, "here"), Rule(0.2, "x", "limit")])])');

    expect([...host.querySelectorAll('.clew-plot-key')].map((el) => el.textContent)).toEqual(['curve']);
    expect(all(host, '.clew-plot-label').map((el) => el.textContent)).toEqual(['here', 'limit']);
  });

  it('marks each point of a short data line but not a sampled curve', () => {
    const { host } = render('root = Stack([Plot([0, 3], [Line([[0, 1], [1, 3], [2, null], [3, 2]], "Sales"), Line(@Curve("x", 0, 3), "Trend")], [0, 4])])');

    expect(all(host, '.clew-plot-marker')).toHaveLength(3);
  });

  it('moves a dot label off a line that crosses its usual corner', () => {
    const rising = render('root = Stack([Plot([0, 1], [Line(@Curve("x", 0, 1)), Dot(0.4, 0.4, "here")], [0, 1])])').host;
    const flat = render('root = Stack([Plot([0, 1], [Line(@Curve("0", 0, 1)), Dot(0.4, 0.5, "here")], [0, 1])])').host;

    expect(rising.querySelector('.clew-plot-label')!.getAttribute('text-anchor')).toBe('end');
    expect(flat.querySelector('.clew-plot-label')!.getAttribute('text-anchor')).toBe('start');
  });

  it('drops a single legend entry that the y-axis title already names', () => {
    const repeated = render('root = Stack([Plot([0, 1], [Line([[0, 0], [1, 1]], "Cost")], [0, 1], "Units", "Cost, $k")])').host;
    const distinct = render('root = Stack([Plot([0, 1], [Line([[0, 0], [1, 1]], "Reciprocal")], [0, 1], "x", "y")])').host;

    expect(repeated.querySelector('.clew-plot-key')).toBeNull();
    expect(distinct.querySelector('.clew-plot-key')!.textContent).toBe('Reciprocal');
  });
});
