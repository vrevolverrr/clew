import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { strictComponent } from '../OpenUIRenderer';
import { reducedMotion } from '@/renderer/figure/dom';
import { position, status, type Point } from '@/renderer/figure/geometry';
import { Step } from '../steps/operations';
import { stepFigure, type FigureDrawing } from '../steps/StepFigure';
import { layoutBoard } from './layoutBoard';
import { replayBoard, type BoardReplay } from './replayBoard';

const BOARD_DOCUMENT = "Board(regions, steps) shows blocks in named places with its own Back, Next, scrubber and Play. Do not add a Player or step variable. Step(caption, changes) supplies one visible snapshot. changes is a string of moves separated by semicolons, processed in order. Snapshot k is the state after steps 0 through k, starting empty. Intermediate moves inside a step are not shown: entering, matching and leaving need separate steps when each matters.\n\nA region is {id, label, slots, cols?}. slots is a positive integer; positions count from 0 to slots - 1. cols is a positive integer no larger than slots, defaults to slots, and makes a row-major grid. Regions keep declaration order. IDs match [A-Za-z_][A-Za-z0-9_]* and are case-sensitive. Region IDs are unique. A block has a globally unique ID within its Board; it displays its label, or its ID before labeling. Labels are plain text.\n\n- `A B C > place` moves blocks in order to the lowest free slots. An existing block's own slot counts as free while placing that block. Unknown IDs create blocks with a plain tag. Full regions are errors.\n- `A > place:2` moves one block to slot 2. Another block already there is an error. To swap occupied slots, move one block to a spare slot or temporary region first. Moves preserve labels and tags.\n- `A >> place` or `A >> place:2` copies an existing block, retaining A at its source. The copy has A's current label (or source ID) and a plain tag. An explicit slot replaces its occupant; without a slot, a full region is an error. Copying onto the source's own slot is an error. Names are A_copy, A_copy2, A_copy3, counting successful copies of A over the whole replay; deletion never resets the counter. IDs ending in _copy or _copy followed by digits are reserved: only copying creates them, but later operations and further copies may reference them.\n- `A B ~ active`, `A B ~ done`, or `A B ~ dim` sets tags on existing blocks. `A B ~` clears to plain. No other tags are accepted.\n- `A = 'text'` sets a label, optionally before A's creation. Text may contain semicolons but no single quote; use a typographic apostrophe if needed. Escape outer double quotes and backslashes according to OpenUI string syntax.\n- `-A B` removes existing blocks A and B and their labels. Unknown IDs are errors. Recreating an ordinary ID starts plain, with its ID as label unless labeled again. Copy counters survive removal.\n\nEvery move names a declared region and an in-range slot. Each slot holds at most one block after every move, not merely at step boundaries. Repeated IDs in one multi-block operation are errors. Malformed moves invalidate the figure, rather than silently changing the lesson. Reading from disk or another persistent store uses copies so originals remain visible.";

function drawBoard(surface: HTMLElement, replay: BoardReplay): FigureDrawing {
  const scroll = surface.parentElement!;
  let layout: ReturnType<typeof layoutBoard> | undefined;
  let key = '';
  let locations = new Map<string, readonly Point[]>();
  let regions: HTMLElement[] = [];
  let shown = 0;
  const elements = new Map<string, HTMLElement>();
  const size = (element: HTMLElement) => {
    element.style.width = `${layout!.cell.width}px`;
    element.style.height = `${layout!.cell.height}px`;
  };
  // Before the figure is attached it has no width; the observer lays it out again once it does.
  const place = (): boolean => {
    const next = layoutBoard(replay, scroll.clientWidth || 740);
    const nextKey = JSON.stringify(next);
    if (nextKey === key) return false;
    layout = next;
    key = nextKey;
    regions.forEach(r => r.remove());
    regions = next.regions.map(region => {
      const box = document.createElement('div');
      box.className = 'clew-board-region';
      position(box, region);
      box.style.width = `${region.width}px`;
      box.style.height = `${region.height}px`;
      const label = box.appendChild(document.createElement('div'));
      label.className = 'clew-board-region-label';
      label.textContent = region.label;
      label.style.height = `${region.headerHeight}px`;
      for (const p of region.slots) {
        const slot = box.appendChild(document.createElement('div'));
        slot.className = 'clew-board-slot';
        position(slot, { x: p.x - region.x, y: p.y - region.y });
        slot.style.width = `${next.cell.width}px`;
        slot.style.height = `${next.cell.height}px`;
      }
      return box;
    });
    surface.prepend(...regions);
    locations = new Map(next.regions.map(r => [r.id, r.slots]));
    surface.style.width = `${next.width}px`;
    surface.style.height = `${next.height}px`;
    for (const element of elements.values()) size(element);
    return true;
  };
  const displayed = new Map<string, Point>();
  let frame: number | undefined;
  let generation = 0;
  const cancel = () => {
    generation++;
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
  };
  const show = (index: number, animate: boolean) => {
    cancel();
    shown = index;
    const token = generation;
    const snapshot = replay.snapshots[index];
    const ids = new Set(snapshot.blocks.map(b => b.id));
    for (const [id, element] of elements) if (!ids.has(id)) { element.remove(); elements.delete(id); }
    const moves = new Map<HTMLElement, { from: Point; to: Point }>();
    for (const block of snapshot.blocks) {
      const to = locations.get(block.region)![block.slot];
      const from = displayed.get(block.id) ?? (block.copiedFrom === undefined ? undefined : displayed.get(block.copiedFrom)) ?? to;
      let element = elements.get(block.id);
      if (!element) {
        element = surface.appendChild(document.createElement('div'));
        element.className = 'clew-board-block';
        element.dataset.block = block.id;
        size(element);
        elements.set(block.id, element);
      }
      element.dataset.tag = block.tag;
      element.textContent = status(block.tag) + block.label;
      element.setAttribute('aria-label', `${block.label}, ${block.tag}, ${block.region}, slot ${block.slot}`);
      moves.set(element, { from, to });
    }
    const moving = animate && !reducedMotion() && [...moves.values()].some(({ from, to }) => from.x !== to.x || from.y !== to.y);
    displayed.clear();
    const paint = (progress: number) => {
      for (const [element, { from, to }] of moves) {
        const p = { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
        position(element, p);
        displayed.set(element.dataset.block!, p);
      }
    };
    paint(moving ? 0 : 1);
    if (moving) {
      const start = performance.now();
      const tick = (now: number) => {
        if (token !== generation) return;
        const progress = Math.min(1, Math.max(0, (now - start) / 200));
        paint(progress);
        frame = progress < 1 ? window.requestAnimationFrame(tick) : undefined;
      };
      frame = window.requestAnimationFrame(tick);
    }
  };
  place();
  // Laying out inside the callback resizes the observed box in the same frame, which the browser reports as a loop.
  let resize: number | undefined;
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    resize ??= window.requestAnimationFrame(() => {
      resize = undefined;
      if (place()) show(shown, false);
    });
  });
  observer?.observe(scroll);
  return {
    captions: replay.snapshots.map(s => s.caption),
    show,
    destroy: () => {
      cancel();
      observer?.disconnect();
      if (resize !== undefined) window.cancelAnimationFrame(resize);
    },
  };
}

export const Board = defineComponent({
  name: 'Board', description: BOARD_DOCUMENT,
  props: z.object({ regions: z.array(z.object({ id: z.string(), label: z.string(), slots: z.number(), cols: z.number().optional() })), steps: z.array(Step.ref) }),
  component: strictComponent((ctx) => stepFigure(ctx, 'Board', (surface, props) => drawBoard(surface, replayBoard(props)))),
});
