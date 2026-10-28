import { createLibrary, defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { Board } from './board/Board';
import { Choice } from './components/Choice';
import { Grid } from './components/Grid';
import { Area, Bars, Dot, Line, Note, Plot, Rule } from './components/Plot';
import { Quiz } from './components/Quiz';
import { Player } from './components/Player';
import { Slider } from './components/Slider';
import { Stat } from './components/Stat';
import { TextInput } from './components/TextInput';
import { Curve, Eval } from './functions/functions';
import { Network } from './network/Network';
import type { ComponentFactory } from './OpenUIRenderer';
import { Hide, Label, Show, Step, Tag } from './steps/operations';

/** A component drawn by writing Markdown, so Obsidian's own styles and math apply. */
function markdownComponent(className: string, toMarkdown: (props: Record<string, unknown>) => string): ComponentFactory {
  return (ctx) => {
    const el = document.createElement('div');
    el.className = className;
    let rendered: string | null = null;
    return {
      el,
      update: (props) => {
        const markdown = toMarkdown(props);
        if (markdown === rendered) return;
        rendered = markdown;
        ctx.renderMarkdown(el, markdown);
      },
    };
  };
}

const TextContent = defineComponent({
  name: 'TextContent',
  description: 'Markdown text.',
  props: z.object({ text: z.string() }),
  component: markdownComponent('clew-text', ({ text }) => String(text)),
});

const Callout = defineComponent({
  name: 'Callout',
  description: 'A boxed definition, tip, or warning.',
  props: z.object({
    kind: z.enum(['note', 'tip', 'warning', 'example', 'question']),
    title: z.string(),
    text: z.string(),
  }),
  component: markdownComponent('clew-callout', ({ kind, title, text }) => {
    const body = String(text ?? '').split(/\r?\n/).map((line) => `> ${line}`).join('\n');
    return `> [!${String(kind ?? 'note')}] ${String(title ?? '').replace(/\r?\n/g, ' ')}\n${body}`;
  }),
});

const Sequence = defineComponent({
  name: 'Sequence',
  description: 'An all-visible ordered walkthrough with numbered circles and connecting lines. Each TextContent is one item; put its heading and Markdown body in the text.',
  props: z.object({ children: z.array(TextContent.ref) }),
  component: ((ctx) => {
    const el = document.createElement('ol');
    el.className = 'clew-sequence';
    el.setAttribute('role', 'list');
    return {
      el,
      update: ({ children }) => {
        const items = Array.isArray(children) ? children : [];
        while (el.children.length > items.length) {
          const item = el.lastElementChild as HTMLElement;
          ctx.renderChildren(item, null);
          item.remove();
        }
        items.forEach((child, index) => {
          const item = el.children[index] as HTMLElement | undefined
            ?? el.appendChild(document.createElement('li'));
          ctx.renderChildren(item, child);
        });
      },
    };
  }) satisfies ComponentFactory,
});

const Stack = defineComponent({
  name: 'Stack',
  description: 'Vertical layout.',
  props: z.object({ children: z.array(z.union([TextContent.ref, Sequence.ref, Callout.ref, Stat.ref, Slider.ref, Choice.ref, TextInput.ref, Player.ref, Plot.ref, Grid.ref, Quiz.ref, Board.ref, Network.ref])) }),
  component: ((ctx) => {
    const el = document.createElement('div');
    el.className = 'clew-stack';
    return { el, update: ({ children }) => ctx.renderChildren(el, children) };
  }) satisfies ComponentFactory,
});

export const library = createLibrary<ComponentFactory>({
  components: [Stack, TextContent, Sequence, Callout, Stat, Slider, Choice, TextInput, Player, Quiz, Grid, Plot, Line, Area, Bars, Dot, Rule, Note, Board, Network, Step, Tag, Label, Show, Hide],
  functions: [Curve, Eval],
  root: 'Stack',
});
