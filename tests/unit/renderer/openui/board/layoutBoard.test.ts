import { layoutBoard } from '@/renderer/openui/board/layoutBoard';
import { replayBoard } from '@/renderer/openui/board/replayBoard';

const step = (changes: string) => ({ typeName: 'Step', props: { caption: 'A step', changes } });
const board = (regions: { id: string; label: string; slots: number; cols?: number }[], changes: string) => replayBoard({ regions, steps: [step(changes)] });
const queue = board([{ id: 'ready', label: 'Ready queue', slots: 3 }, { id: 'cpu', label: 'CPU', slots: 1 }, { id: 'done', label: 'Finished', slots: 3 }], 'P1 P2 P3 > ready');
const rows = (layout: ReturnType<typeof layoutBoard>) => new Set(layout.regions.map(r => r.y)).size;

describe('Board layout', () => {
  it('fits a narrow pane by shrinking cells to their labels and stacking regions', () => {
    const layout = layoutBoard(queue, 320);
    expect(layout.width).toBeLessThanOrEqual(320);
    expect(rows(layout)).toBeGreaterThan(1);
  });

  it('places regions side by side when they fit, and widens cells only up to the cap', () => {
    const layout = layoutBoard(queue, 2000);
    expect(rows(layout)).toBe(1);
    expect(layout.cell.width).toBe(176);
  });

  it('grows cells to use the width the tightest row leaves', () => {
    const narrow = layoutBoard(queue, 320);
    const wider = layoutBoard(queue, 480);
    expect(wider.cell.width).toBeGreaterThan(narrow.cell.width);
    expect(wider.width).toBeLessThanOrEqual(480);
  });

  it('keeps an author grid that cannot fit on its own row and lets it overflow', () => {
    const wide = board([{ id: 'r', label: 'R', slots: 12 }, { id: 's', label: 'S', slots: 1 }], 'Long_block_name > r');
    const layout = layoutBoard(wide, 320);
    expect(layout.width).toBeGreaterThan(320);
    expect(layout.regions.map(r => r.y)).toEqual([0, expect.any(Number)]);
    expect(layout.regions[1].y).toBeGreaterThan(0);
  });

  it('keeps every slot inside its region and the regions inside the board', () => {
    for (const available of [240, 320, 480, 800]) {
      const layout = layoutBoard(queue, available);
      for (const region of layout.regions) {
        expect(region.x + region.width).toBeLessThanOrEqual(layout.width);
        expect(region.y + region.height).toBeLessThanOrEqual(layout.height);
        for (const slot of region.slots) {
          expect(slot.x).toBeGreaterThanOrEqual(region.x);
          expect(slot.x + layout.cell.width).toBeLessThanOrEqual(region.x + region.width);
          expect(slot.y + layout.cell.height).toBeLessThanOrEqual(region.y + region.height);
        }
      }
    }
  });
});
