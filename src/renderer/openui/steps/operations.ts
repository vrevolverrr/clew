import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { dataComponent } from '../OpenUIRenderer';
const ids = z.union([z.string(), z.array(z.string())]);

export const Tag = defineComponent({
  name: 'Tag', description: 'Set node or edge tags: active, done, dim; omit tag to clear.',
  props: z.object({ targets: ids, tag: z.string().optional() }), component: dataComponent,
});
export const Label = defineComponent({
  name: 'Label', description: 'Set one node or edge label to plain text.',
  props: z.object({ target: z.string(), text: z.string() }), component: dataComponent,
});
export const Show = defineComponent({
  name: 'Show', description: 'Show declared nodes, restoring their labels and tags.',
  props: z.object({ ids }), component: dataComponent,
});
export const Hide = defineComponent({
  name: 'Hide', description: 'Hide declared nodes and their incident edges, preserving state.',
  props: z.object({ ids }), component: dataComponent,
});
export const Step = defineComponent({
  name: 'Step', description: 'One captioned snapshot; the caption is Markdown, with maths as $...$. Board takes a move string; Network takes an operation list.',
  props: z.object({ caption: z.string(), changes: z.union([z.string(), z.array(z.union([Tag.ref, Label.ref, Show.ref, Hide.ref]))]) }),
  component: dataComponent,
});
