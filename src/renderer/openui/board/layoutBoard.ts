import type { Point, Size } from '../steps/geometry';
import { fittedSize, labelSize } from '../steps/geometry';
import type { BoardReplay } from './replayBoard';

interface RegionGeometry extends Point, Size {
  readonly id: string;
  readonly label: string;
  readonly headerHeight: number;
  /** Slot positions relative to the board. */
  readonly slots: readonly Point[];
}
interface BoardLayout extends Size {
  readonly cell: Size;
  readonly regions: readonly RegionGeometry[];
}

const GAP = 16;
const PADDING = 16;
const SLOT_GAP = 8;
const MAX_CELL = 176;

/**
 * Packs regions into rows that fit `available` at the narrowest cell the labels allow,
 * then widens every cell as far as the tightest row still fits, up to MAX_CELL.
 * A region wider than `available` on its own keeps its own row and overflows.
 */
export function layoutBoard(replay: BoardReplay, available: number): BoardLayout {
  const min = fittedSize(replay.snapshots.flatMap(s => s.blocks.map(b => b.label)), 48, MAX_CELL);
  const widthAt = (cols: number, cell: number) => cols * (cell + SLOT_GAP) + PADDING;
  const rows: (typeof replay.regions[number])[][] = [];
  let used = 0;
  for (const region of replay.regions) {
    const width = widthAt(region.cols, min.width);
    if (rows.length && used + GAP + width <= available) {
      rows[rows.length - 1].push(region);
      used += GAP + width;
    } else {
      rows.push([region]);
      used = width;
    }
  }
  const fill = Math.min(...rows.map(row => (available - GAP * (row.length - 1) - PADDING * row.length) / row.reduce((sum, r) => sum + r.cols, 0) - SLOT_GAP));
  const cell = { width: Math.floor(Math.max(min.width, Math.min(MAX_CELL, fill))), height: min.height };

  const regions: RegionGeometry[] = [];
  let y = 0;
  let width = 0;
  for (const row of rows) {
    let x = 0;
    let rowHeight = 0;
    for (const region of row) {
      const regionWidth = widthAt(region.cols, cell.width);
      const headerHeight = labelSize([region.label], regionWidth).height;
      const regionHeight = headerHeight + Math.ceil(region.slots / region.cols) * (cell.height + SLOT_GAP) + PADDING;
      const slots = Array.from({ length: region.slots }, (_, i) => ({ x: x + 12 + (i % region.cols) * (cell.width + SLOT_GAP), y: y + headerHeight + 4 + Math.floor(i / region.cols) * (cell.height + SLOT_GAP) }));
      regions.push({ id: region.id, label: region.label, x, y, width: regionWidth, height: regionHeight, headerHeight, slots });
      x += regionWidth + GAP;
      rowHeight = Math.max(rowHeight, regionHeight);
    }
    width = Math.max(width, x - GAP);
    y += rowHeight + GAP;
  }
  return { cell, regions, width: Math.max(240, width), height: Math.max(80, y - GAP) };
}
