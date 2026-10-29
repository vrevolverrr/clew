import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { Controlled, reactive } from '../Controlled';
import { formatFigure } from '@/renderer/figure/formatFigure';
import type { ComponentFactory } from '../OpenUIRenderer';

export const Slider = defineComponent({
  name: 'Slider',
  description: 'A number the student drags.',
  props: z.object({
    label: z.string(),
    min: z.number(),
    max: z.number(),
    step: z.number(),
    value: reactive(z.number()),
    unit: z.string().optional(),
  }),
  component: ((ctx) => {
    const control = new Controlled<number>(ctx, (props) => show(props));
    const el = document.createElement('label');
    el.className = 'clew-slider';
    const row = el.appendChild(document.createElement('span'));
    row.className = 'clew-control-row';
    const name = row.appendChild(document.createElement('span'));
    const out = row.appendChild(document.createElement('output'));
    const input = el.appendChild(document.createElement('input'));
    input.type = 'range';
    input.addEventListener('input', () => control.write(Number(input.value)));
    const show = ({ label, min, max, step, value, unit }: Record<string, unknown>) => {
      const shown = control.read(value);
      name.textContent = String(label);
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      if (Number(input.value) !== shown) input.value = String(shown);
      const span = Number(max) - Number(min);
      input.style.setProperty('--clew-progress', `${span > 0 ? ((shown - Number(min)) / span) * 100 : 0}%`);
      out.textContent = `${formatFigure(shown)}${unit ? ` ${String(unit)}` : ''}`;
    };
    return {
      el,
      update: control.update,
    };
  }) satisfies ComponentFactory,
});
