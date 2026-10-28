/**
 * @jest-environment jsdom
 */
import { VISUALS_DEMO_REPLY } from '@/chat/obsidian/playVisualsDemo';
import { splitReply } from '@/chat/splitReply';
import { library } from '@/renderer/openui/library';
import { OpenUIRenderer } from '@/renderer/openui/OpenUIRenderer';

jest.mock('obsidian', () => ({ Notice: jest.fn() }), { virtual: true });

const fences = splitReply(VISUALS_DEMO_REPLY, true).filter((segment) => segment.kind === 'openui');

function draw(program: string) {
  const host = document.body.appendChild(document.createElement('div'));
  const renderer = new OpenUIRenderer(host, library, () => undefined);
  renderer.set(program, true);
  return { host, errors: renderer.errors };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('the visuals demo reply', () => {
  it('has a fence for every kind of visual, and two that fail on purpose', () => {
    expect(fences).toHaveLength(17);
    expect(splitReply(VISUALS_DEMO_REPLY, true).filter((segment) => segment.kind === 'mermaid')).toHaveLength(1);
    const used = new Set(fences.flatMap((fence) => [...fence.text.matchAll(/\b([A-Z]\w*)\(/g)].map((match) => match[1])));
    expect(Object.keys(library.components).filter((name) => !used.has(name))).toEqual([]);
  });

  it('draws every fence without an error except the two that fail on purpose', () => {
    const outcomes = fences.map((fence) => draw(fence.text).errors);

    expect(outcomes.slice(0, -2)).toEqual(Array(outcomes.length - 2).fill([]));
    expect(outcomes.at(-2)).toEqual(['Board: Step 2: full region desk']);
    expect(outcomes.at(-1)).toEqual([expect.stringContaining('Chart')]);
  });

  it('plots a curve, a shaded tail, a waterfall and a marked point', () => {
    const [taylor, risk, bridge, npv] = fences.slice(0, 4).map((fence) => draw(fence.text).host);

    expect(taylor!.querySelectorAll('.clew-plot-line')).toHaveLength(2);
    expect(risk!.querySelector('.clew-plot-area')).not.toBeNull();
    expect(bridge!.querySelectorAll('.clew-plot-bar')).toHaveLength(8);
    expect(npv!.querySelector('.clew-plot-dot')).not.toBeNull();
  });

  it('reads the values the model would expect from the waterfall and the NPV', () => {
    const [, , bridge, npv] = fences.slice(0, 4).map((fence) => draw(fence.text).host);

    expect(bridge!.querySelector('.clew-stat-value')!.textContent).toBe('135');
    expect(npv!.querySelector('.clew-stat-value')!.textContent).toBe('✓109');
  });
});
