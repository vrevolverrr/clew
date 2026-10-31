/** @jest-environment jsdom */
import { VISUALS_DEMO_TURNS } from '@/chat/obsidian/playVisualsDemo';
import { splitReply } from '@/chat/splitReply';
import { diagramExtent, drawDiagram } from '@/renderer/figure/drawDiagram';
import type { FigureNode } from '@/renderer/figure/FigureData';
import * as labels from '@/renderer/figure/placeLabels';
import { WORKER_SOURCE } from '@/renderer/figure/sandboxSource';
import { validateFigure } from '@/renderer/figure/validateFigure';

import { runFigureWorker } from '../../tests/runFigureWorker';

jest.mock('obsidian', () => ({ Notice: jest.fn() }), { virtual: true });
// jsdom has no structuredClone; figure data is plain JSON.
globalThis.structuredClone ??= (value) => JSON.parse(JSON.stringify(value));

type Diagram = Extract<FigureNode, { type: 'Diagram' }>;

const incline = VISUALS_DEMO_TURNS.flatMap((turn) => splitReply(turn.reply, true))
  .filter((segment) => segment.kind === 'figure')
  .map((segment) => segment.text)
  .find((source) => source.includes('Incline angle'))!;

function diagramIn(node: unknown): Diagram | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if ((node as FigureNode).type === 'Diagram') return node as Diagram;
  for (const value of Object.values(node)) {
    const found = Array.isArray(value) ? value.map(diagramIn).find(Boolean) : diagramIn(value);
    if (found) return found;
  }
  return undefined;
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test('drawDiagram on the visuals demo incline, at every slider angle', async () => {
  const diagrams: [number, Diagram][] = [];
  for (let angle = 10; angle <= 60; angle += 5) {
    const result = validateFigure(await runFigureWorker(WORKER_SOURCE, { kind: 'run', source: incline, params: { angle } }));
    if (!result.ok) throw new Error(result.error);
    diagrams.push([angle, diagramIn(result.figure)!]);
  }

  const real = labels.placeLabels;
  let placing = 0;
  jest.spyOn(labels, 'placeLabels').mockImplementation((...args) => {
    const start = performance.now();
    const out = real(...args);
    placing += performance.now() - start;
    return out;
  });
  // Labels are rendered by Obsidian in the app and cached per text, so this times layout and DOM only.
  const markdown = (box: HTMLElement, text: string | number): void => void (box.textContent = String(text));
  const el = document.body.appendChild(document.createElement('div'));
  const rows: Record<string, number>[] = [];
  for (const width of [320, 600]) {
    for (const [angle, node] of diagrams) {
      const extent = diagramExtent(node);
      for (let i = 0; i < 20; i += 1) drawDiagram(el, node, extent, width, markdown);
      const total: number[] = [];
      const place: number[] = [];
      for (let i = 0; i < 200; i += 1) {
        placing = 0;
        const start = performance.now();
        drawDiagram(el, node, extent, width, markdown);
        total.push(performance.now() - start);
        place.push(placing);
      }
      rows.push({
        width, angle, 'median ms': +median(total).toFixed(3), 'p95 ms': +[...total].sort((a, b) => a - b)[189].toFixed(3),
        'placeLabels ms': +median(place).toFixed(3), 'svg nodes': el.querySelectorAll('svg *').length, labels: el.querySelectorAll('.clew-figure-diagram-label').length,
      });
    }
  }
  console.table(rows);
});
