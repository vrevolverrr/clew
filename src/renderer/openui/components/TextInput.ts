import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { Controlled, reactive } from '../Controlled';
import type { ComponentFactory } from '../OpenUIRenderer';

export const TextInput = defineComponent({
  name: 'TextInput',
  description: 'A short text the student types.',
  props: z.object({ label: z.string(), value: reactive(z.string()), maxLength: z.number().optional() }),
  component: ((ctx) => {
    const control = new Controlled<string>(ctx, (props) => show(props));
    const el = document.createElement('label');
    el.className = 'clew-text-input';
    const name = el.appendChild(document.createElement('span'));
    name.className = 'clew-control-row';
    const input = el.appendChild(document.createElement('input'));
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.addEventListener('input', () => control.write(input.value));
    const show = ({ label, value, maxLength }: Record<string, unknown>) => {
      const shown = control.read(value);
      name.textContent = String(label);
      if (maxLength === undefined) input.removeAttribute('maxlength');
      else input.maxLength = Number(maxLength);
      // Writing the same text back would move the caret.
      if (input.value !== shown) input.value = shown;
    };
    return {
      el,
      update: control.update,
    };
  }) satisfies ComponentFactory,
});
