import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { Controlled, reactive } from '../Controlled';
import type { ComponentFactory } from '../OpenUIRenderer';

export const Choice = defineComponent({
  name: 'Choice',
  description: 'Pick one of a few options; the variable holds the chosen option.',
  props: z.object({ label: z.string(), options: z.array(z.string()), value: reactive(z.string()) }),
  component: ((ctx) => {
    const control = new Controlled<string>(ctx, (props) => show(props));
    const el = document.createElement('div');
    el.className = 'clew-choice';
    const name = el.appendChild(document.createElement('span'));
    name.className = 'clew-control-row';
    const group = el.appendChild(document.createElement('div'));
    group.className = 'clew-choice-options';
    group.setAttribute('role', 'group');
    let listed: string[] = [];
    const show = ({ label, options, value }: Record<string, unknown>) => {
      const shown = control.read(value);
      name.textContent = String(label);
      group.setAttribute('aria-label', String(label));
      const names = (options as string[]).map(String);
      // Rebuilt only when the options change, so a focused button stays focused while the student picks.
      if (names.join('\u0000') !== listed.join('\u0000')) {
        listed = names;
        group.replaceChildren(
          ...names.map((option) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'clew-choice-option';
            button.textContent = option;
            button.addEventListener('click', () => control.write(option));
            return button;
          }),
        );
      }
      [...group.children].forEach((button, index) => button.setAttribute('aria-pressed', String(names[index] === shown)));
    };
    return {
      el,
      update: control.update,
    };
  }) satisfies ComponentFactory,
});
