import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { formatFigure } from '../formatFigure';
import type { ComponentFactory } from '../OpenUIRenderer';

/** A longer string is a sentence or a set, not a figure, so it is not drawn as a headline. */
const FIGURE_MAX_LENGTH = 12;

export const Stat = defineComponent({
  name: 'Stat',
  description: 'A labelled figure; status adds a check or a cross.',
  props: z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    status: z.enum(['good', 'bad']).optional(),
  }),
  component: (() => {
    const el = document.createElement('div');
    el.className = 'clew-stat';
    const label = el.appendChild(document.createElement('span'));
    label.className = 'clew-stat-label';
    const value = el.appendChild(document.createElement('span'));
    value.className = 'clew-stat-value';
    const mark = value.appendChild(document.createElement('span'));
    const figure = value.appendChild(document.createTextNode(''));
    return {
      el,
      update: ({ label: name, value: shown, status }) => {
        label.textContent = String(name);
        figure.data = formatFigure(shown);
        el.classList.toggle('is-text', figure.data.length > FIGURE_MAX_LENGTH);
        mark.className = `clew-stat-mark${status ? ` is-${String(status)}` : ''}`;
        mark.textContent = status === 'good' ? '✓' : status === 'bad' ? '✕' : '';
        mark.setAttribute('aria-label', status === 'good' ? 'passes' : status === 'bad' ? 'fails' : '');
      },
    };
  }) satisfies ComponentFactory,
});
