/** @jest-environment jsdom */
import { diagramExtent, drawDiagram } from '@/renderer/figure/drawDiagram';
import type { DiagramLayer, FigureNode } from '@/renderer/figure/FigureData';

const diagram = (...children: DiagramLayer[]): Extract<FigureNode, { type: 'Diagram' }> => ({ type: 'Diagram', width: 4, height: 3, children });

describe('diagramExtent', () => {
  it('fits a drawing to what it draws, with no border', () => {
    expect(diagramExtent(diagram({ type: 'Segment', from: [-1, -2], to: [3, 4] }))).toEqual([-1, -2, 3, 4]);
  });

  it('leaves out empty space between the origin and the drawing', () => {
    expect(diagramExtent(diagram({ type: 'Segment', from: [1, 2], to: [3, 4] }))).toEqual([1, 2, 3, 4]);
  });

  it('gives a single point a unit around it', () => {
    expect(diagramExtent(diagram({ type: 'Points', pts: [[2, -1]] }))).toEqual([1, -2, 3, 0]);
  });
});

describe('drawDiagram', () => {
  it('grows past its border to hold a Dimension drawn off its points', () => {
    const node = diagram({ type: 'Segment', from: [0, 0], to: [4, 0] }, { type: 'Dimension', from: [0, 0], to: [4, 0], label: '4' });
    const el = document.createElement('div');
    drawDiagram(el, node, diagramExtent(node), 480, (box, text) => void (box.textContent = String(text)));
    const [vx, vy, vw, vh] = el.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    const ys = [...el.querySelectorAll('path.is-dimension')].flatMap((path) => [...path.getAttribute('d')!.matchAll(/[ML][\d.-]+,([\d.-]+)/g)].map((m) => Number(m[1])));
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) expect(y >= vy && y <= vy + vh).toBe(true);
    expect(vx).toBe(0);
    expect(vw).toBeGreaterThan(0);
  });

  it('colours a Vector\'s arrowhead like its line', () => {
    const node = diagram({ type: 'Vector', from: [0, 0], to: [4, 3], tag: 'good' }, { type: 'Vector', from: [0, 3], to: [4, 0] });
    const el = document.createElement('div');
    drawDiagram(el, node, diagramExtent(node), 480, (box, text) => void (box.textContent = String(text)));
    const fills = [...el.querySelectorAll('path.is-vector')].map((path) => el.querySelector<SVGElement>(`${path.getAttribute('marker-end')!.slice(4, -1)} path`)!.style.fill);
    expect(fills).toEqual(['var(--clew-figure-tag-good)', 'var(--clew-figure-ink)']);
  });

  it('grows above a line along its top edge to hold the line\'s label', () => {
    const node = diagram({ type: 'Segment', from: [0, 3], to: [4, 3], label: 'ceiling' }, { type: 'Segment', from: [2, 0], to: [2, 3] });
    const el = document.createElement('div');
    drawDiagram(el, node, diagramExtent(node), 480, (box, text) => void (box.textContent = String(text)));
    const vy = Number(el.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[1]);
    const lineY = Number(/^M[\d.-]+,([\d.-]+)/.exec(el.querySelector('path')!.getAttribute('d')!)![1]) - vy;
    const label = el.querySelector<HTMLElement>('.clew-figure-diagram-label')!;
    expect(parseFloat(label.style.top) + 18).toBeLessThanOrEqual(lineY);
  });

  it('draws a closed Shape\'s label with no backing', () => {
    const node = diagram({ type: 'Shape', pts: [[0, 0], [2, 0], [2, 1], [0, 1]], closed: true, label: 'M' });
    const el = document.createElement('div');
    drawDiagram(el, node, diagramExtent(node), 480, (box, text) => void (box.textContent = String(text)));
    expect(el.querySelector('.clew-figure-diagram-label')!.classList.contains('is-inside')).toBe(true);
  });
});
