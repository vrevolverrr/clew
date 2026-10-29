import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { Controlled, reactive } from '../Controlled';
import type { ComponentFactory } from '../OpenUIRenderer';
import { Playback } from '@/renderer/figure/Playback';

export const Player = defineComponent({
  name: 'Player',
  description: 'Steps a $variable from 0 to max: Back, Next, Play. Play adds step (default 1) every ms (default 800).',
  props: z.object({
    max: z.number(),
    value: reactive(z.number()),
    ms: z.number().optional(),
    step: z.number().optional(),
  }),
  component: ((ctx) => {
    const control = new Controlled<number>(ctx, props => playback.update(Number(props.max), control.read(props.value), { ms: Number(props.ms), step: Number(props.step) }));
    const playback = new Playback(value => control.write(value));
    return { el: playback.el, update: control.update, destroy: () => playback.stop() };
  }) satisfies ComponentFactory,
});
