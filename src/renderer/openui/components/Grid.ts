import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { CaptionStack } from '../CaptionStack';
import { reactive } from '../Controlled';
import { div } from '../dom';
import { formatFigure } from '../formatFigure';
import type { ComponentFactory } from '../OpenUIRenderer';

function head(role: 'columnheader' | 'rowheader', text: string): HTMLElement {
  const el = div('clew-grid-head', role);
  el.textContent = text;
  return el;
}

function cell(): HTMLElement {
  const el = div('clew-grid-cell', 'gridcell');
  el.appendChild(document.createElement('span'));
  return el;
}

function row(...children: HTMLElement[]): HTMLElement {
  const el = div('clew-grid-row', 'row');
  el.append(...children);
  return el;
}

/** Row and column of each cell a step reads from, as far as the model wrote them. */
function dependencies(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((pair): [number, number][] => (Array.isArray(pair) && Number.isInteger(pair[0]) && Number.isInteger(pair[1]) ? [[pair[0], pair[1]]] : []));
}

export const Grid = defineComponent({
  name: 'Grid',
  description:
    'A table that fills in as the student steps. cells is the finished table, one array per row. step is a $variable: cells fill in reading order, the first base cells already filled, and each step adds one. The newest cell is outlined, and deps[step-1] lists the [row, col] cells it was worked out from, which are shaded. notes[step] is the caption under the table, notes[0] before the first step. A note is Markdown: write the recurrence for the new cell as maths, such as $\\min(a, b, c) + 1 = 4$, and bold the cells it names. Pair it with Player(max, $step), where max is the number of cells to fill after the base ones. Work every number out with a short script first, then copy the results; do not guess them.',
  props: z.object({
    cols: z.array(z.string()),
    rows: z.array(z.string()),
    cells: z.array(z.array(z.union([z.string(), z.number()]).nullable())),
    step: reactive(z.number()),
    base: z.number().optional(),
    notes: z.array(z.string()).optional(),
    deps: z.array(z.array(z.array(z.number()))).optional(),
  }),
  component: ((ctx) => {
    const el = div('clew-grid');
    const scroll = el.appendChild(div('clew-grid-scroll'));
    const table = scroll.appendChild(div('clew-grid-table', 'grid'));
    const notes = new CaptionStack((target, text) => ctx.renderMarkdown(target, text));
    el.append(notes.el);

    let built = '';
    let columns = 0;
    let cells: HTMLElement[] = [];

    const build = (cols: string[], rows: string[], grid: unknown[][]) => {
      columns = Math.max(cols.length, ...grid.map((r) => r.length), 0);
      table.style.gridTemplateColumns = `repeat(${columns + 1}, auto)`;
      cells = grid.flatMap(() => Array.from({ length: columns }, cell));
      const header = row(head('columnheader', ''), ...Array.from({ length: columns }, (_, c) => head('columnheader', cols[c] ?? '')));
      const body = grid.map((_, r) => row(head('rowheader', rows[r] ?? ''), ...cells.slice(r * columns, (r + 1) * columns)));
      table.replaceChildren(header, ...body);
    };

    return {
      el,
      update: (props) => {
        const cols = ((props.cols as unknown[]) ?? []).map(formatFigure);
        const rows = ((props.rows as unknown[]) ?? []).map(formatFigure);
        const grid = ((props.cells as unknown[][]) ?? []).map((row) => (Array.isArray(row) ? row : []));
        const shape = JSON.stringify([cols, rows, grid.map((row) => row.length)]);
        if (shape !== built) {
          built = shape;
          build(cols, rows, grid);
        }
        const step = Math.max(0, Math.floor(Number(ctx.bind(props.step).value) || 0));
        const shown = Math.max(0, Math.floor(Number(props.base) || 0)) + step;
        const newest = step > 0 ? shown - 1 : -1;
        const sources = new Set(step > 0 ? dependencies(((props.deps as unknown[][]) ?? [])[step - 1]).map(([r, c]) => r * columns + c) : []);
        cells.forEach((cell, index) => {
          const value = grid[Math.floor(index / columns)]?.[index % columns];
          const full = formatFigure(value);
          if (cell.dataset.value !== full) cell.dataset.value = full;
          const text = index < shown ? full : '';
          if (cell.firstElementChild!.textContent !== text) cell.firstElementChild!.textContent = text;
          cell.classList.toggle('is-pending', index >= shown);
          cell.classList.toggle('is-new', index === newest);
          cell.classList.toggle('is-source', sources.has(index));
        });
        const captions = ((props.notes as unknown[]) ?? []).map(String);
        notes.set(captions);
        notes.show(captions[step] ?? '');
      },
    };
  }) satisfies ComponentFactory,
});
