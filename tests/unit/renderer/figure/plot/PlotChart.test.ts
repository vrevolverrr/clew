/** @jest-environment jsdom */
import { type PlotModel, PlotChart } from '@/renderer/figure/plot/PlotChart';

/** A chart whose frame is `width` pixels wide; jsdom lays nothing out. */
function chart(width: number, model: PlotModel): { chart: PlotChart; written: string[] } {
  jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
  const written: string[] = [];
  const plot = new PlotChart(document.body.appendChild(document.createElement('div')));
  plot.writeLabel = (el, text) => {
    written.push(text);
    el.textContent = text;
  };
  plot.render(model);
  return { chart: plot, written };
}

const texts = (plot: PlotChart): SVGTextElement[] => [...plot.el.querySelectorAll<SVGTextElement>('svg text')];

afterEach(() => {
  jest.restoreAllMocks();
  document.body.replaceChildren();
});

describe('PlotChart', () => {
  it('has the owner typeset labels and axis titles holding maths, and keeps plain ones as SVG text', () => {
    const { chart: plot, written } = chart(480, {
      x: [-40, 100],
      y: [-70, 70],
      xLabel: '$\\sigma$ (MPa)',
      yLabel: '$\\tau$ (MPa)',
      layers: [
        { kind: 'dot', x: 88, y: 0, label: '$\\sigma_1 = 88.3$' },
        { kind: 'dot', x: 30, y: 0, label: 'C (30, 0)' },
        { kind: 'note', x: 0, y: 50, text: '$\\tau_{max}$' },
      ],
    });
    expect(written).toEqual(expect.arrayContaining(['$\\sigma$ (MPa)', '$\\tau$ (MPa)', '$\\sigma_1 = 88.3$', '$\\tau_{max}$']));
    expect(plot.el.querySelectorAll('.clew-plot-rich-label')).toHaveLength(4);
    expect(texts(plot).some((text) => text.textContent!.includes('$'))).toBe(false);
    expect(texts(plot).map((text) => text.textContent)).toContain('C (30, 0)');
  });

  it('leaves room past the plot for the last x tick label, which is centred on its tick', () => {
    const { chart: plot } = chart(320, { x: [0, 1000], y: [0, 1], layers: [] });
    const last = texts(plot).find((text) => text.textContent === '1000')!;
    expect(Number(last.getAttribute('x')) + (4 * 7.5) / 2).toBeLessThanOrEqual(320);
  });

  it('draws one unit as long on both axes at equal scale', () => {
    const { chart: plot } = chart(480, {
      x: [-1.4, 1.4],
      y: [-1.4, 1.4],
      equal: true,
      layers: [{ kind: 'dot', x: 0, y: 0 }, { kind: 'dot', x: 1, y: 0 }, { kind: 'dot', x: 0, y: 1 }],
    });
    const [origin, right, up] = [...plot.el.querySelectorAll('circle')].map((dot) => [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))]);
    expect(right[0] - origin[0]).toBeCloseTo(origin[1] - up[1], 6);
  });
});
