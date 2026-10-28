import { inBand, placeCard } from '@/tour/placeCard';

const pane = { left: 0, top: 0, right: 400, bottom: 300 };
const bandPane = { top: 100, height: 500 };
const card = { width: 120, height: 40 };

describe('placeCard', () => {
  const at = (x: number, y: number) => ({ x, y, top: y - 18 });

  it('hangs under the cursor, clear of it and of the marked line', () => {
    expect(placeCard(at(50, 50), card, pane)).toEqual({ x: 56, y: 83 });
  });

  it('slides left to stay inside the right edge', () => {
    expect(placeCard(at(390, 50), card, pane).x).toBe(400 - 120 - 8);
  });

  it('moves above the marked line, not onto it, near the bottom edge', () => {
    expect(placeCard(at(50, 280), card, pane).y).toBe(280 - 18 - 40 - 10);
  });

  it('never leaves the top or left of the pane', () => {
    expect(placeCard(at(-50, 5), { width: 120, height: 400 }, pane)).toEqual({ x: 8, y: 8 });
  });
});

describe('inBand', () => {
  it('keeps text between 10% and 60% of the pane height from the top', () => {
    expect(inBand({ top: 150, bottom: 170 }, bandPane)).toBe(true);
    expect(inBand({ top: 390, bottom: 400 }, bandPane)).toBe(true);
  });

  it('moves text above the band or past its lower edge', () => {
    expect(inBand({ top: 120, bottom: 140 }, bandPane)).toBe(false);
    expect(inBand({ top: 380, bottom: 420 }, bandPane)).toBe(false);
  });
});
