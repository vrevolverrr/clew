/** @jest-environment jsdom */
import { diagramExtent, drawDiagram } from '@/renderer/figure/drawDiagram';
import type { DiagramLayer, FigureNode } from '@/renderer/figure/FigureData';

const diagram = (...children: DiagramLayer[]): Extract<FigureNode, { type: 'Diagram' }> => ({ type: 'Diagram', width: 4, height: 3, children });

describe('diagramExtent', () => {
  it('fits a drawing that goes below zero to what it draws, with no border', () => {
    expect(diagramExtent(diagram({ type: 'Segment', from: [-1, -2], to: [3, 4] }))).toEqual([-1, -2, 3, 4]);
  });

  it('starts at the origin when nothing goes below zero', () => {
    expect(diagramExtent(diagram({ type: 'Segment', from: [1, 2], to: [3, 4] }))).toEqual([0, 0, 3, 4]);
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
});
