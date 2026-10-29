export interface LabelBox {
  /** The point the label belongs to. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Centred on its point when nothing is there, as a free label is; else beside it, as a dot's is. */
  center?: boolean;
}

export interface Box { x0: number; y0: number; x1: number; y1: number }

const GAP = 6;

/**
 * Top-left corners for labels in drawing pixels: each beside its point in the corner fewest lines cross, then pushed
 * apart from the others along the axis that needs the shorter move, then kept inside `box`.
 */
export function placeLabels(labels: readonly LabelBox[], box: Box, avoid: readonly (readonly [number, number])[][]): { x: number; y: number }[] {
  const middle = (box.x0 + box.x1) / 2;
  const placed = labels.map((label) => {
    const right = { x: label.x + GAP, y: 0 };
    const left = { x: label.x - GAP - label.width, y: 0 };
    const above = label.y - GAP - label.height;
    const below = label.y + GAP;
    const sides = label.x > middle ? [left, right] : [right, left];
    const corners = [
      ...(label.center ? [{ x: label.x - label.width / 2, y: label.y - label.height / 2 }] : []),
      { x: sides[0].x, y: above }, { x: sides[1].x, y: above }, { x: sides[1].x, y: below }, { x: sides[0].x, y: below },
    ];
    let best = corners[0];
    let fewest = Infinity;
    for (const corner of corners) {
      const crossings = crossingsOf(corner.x, corner.y, label.width, label.height, avoid);
      if (crossings < fewest) [best, fewest] = [corner, crossings];
    }
    return { ...best };
  });

  for (let round = 0; round < 24; round += 1) {
    let moved = false;
    for (let a = 0; a < placed.length; a += 1) {
      for (let b = a + 1; b < placed.length; b += 1) {
        const p = placed[a];
        const q = placed[b];
        const dx = Math.min(p.x + labels[a].width, q.x + labels[b].width) - Math.max(p.x, q.x);
        const dy = Math.min(p.y + labels[a].height, q.y + labels[b].height) - Math.max(p.y, q.y);
        if (dx <= 0 || dy <= 0) continue;
        moved = true;
        if (dx < dy) {
          const sign = p.x + labels[a].width / 2 <= q.x + labels[b].width / 2 ? 1 : -1;
          p.x -= (sign * (dx + 1)) / 2;
          q.x += (sign * (dx + 1)) / 2;
        } else {
          const sign = p.y + labels[a].height / 2 <= q.y + labels[b].height / 2 ? 1 : -1;
          p.y -= (sign * (dy + 1)) / 2;
          q.y += (sign * (dy + 1)) / 2;
        }
      }
    }
    for (let i = 0; i < placed.length; i += 1) clamp(placed[i], labels[i], box);
    if (!moved) break;
  }
  return placed;
}

function clamp(at: { x: number; y: number }, label: LabelBox, box: Box): void {
  at.x = Math.max(box.x0, Math.min(box.x1 - label.width, at.x));
  at.y = Math.max(box.y0, Math.min(box.y1 - label.height, at.y));
}

/** How many line segments pass through the box, sampled along each so a steep stretch still counts. */
function crossingsOf(left: number, top: number, width: number, height: number, lines: readonly (readonly [number, number])[][]): number {
  let count = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length; i += 1) {
      const [px, py] = line[i - 1];
      const [x, y] = line[i];
      for (let t = 0; t <= 1; t += 0.125) {
        const qx = px + (x - px) * t;
        const qy = py + (y - py) * t;
        if (qx >= left - 2 && qx <= left + width + 2 && qy >= top - 2 && qy <= top + height + 2) {
          count += 1;
          break;
        }
      }
    }
  }
  return count;
}
