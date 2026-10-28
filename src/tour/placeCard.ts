/** What the cursor points at: the end of the marked text. `y` is the bottom of its last line and `top` is the top of it. */
export interface Anchor {
  x: number;
  y: number;
  top: number;
}

export interface Size {
  width: number;
  height: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const EDGE = 8;
// The cursor hangs 29px below its tip, so the card starts under it and a little to the right.
const OFFSET_X = 6;
const BELOW = 33;
const ABOVE = 10;

/**
 * Where the card goes: under the cursor, so it never covers the marked text or the cursor. Near the bottom of the pane
 * it moves above the marked line instead; near the right edge it slides left.
 */
export function placeCard({ x, y, top }: Anchor, card: Size, pane: Box): { x: number; y: number } {
  const left = Math.max(pane.left + EDGE, Math.min(x + OFFSET_X, pane.right - card.width - EDGE));
  const below = y + BELOW;
  const fits = below + card.height <= pane.bottom - EDGE;
  return { x: left, y: fits ? below : Math.max(pane.top + EDGE, top - card.height - ABOVE) };
}

// Text already in this band of the pane (as fractions of its height from the top) is left where it is; anything else is centered.
const BAND_TOP = 0.1;
const BAND_BOTTOM = 0.6;

export function inBand({ top, bottom }: { top: number; bottom: number }, pane: { top: number; height: number }): boolean {
  return top >= pane.top + BAND_TOP * pane.height && bottom <= pane.top + BAND_BOTTOM * pane.height;
}
