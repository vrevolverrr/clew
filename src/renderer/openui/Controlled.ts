import { markReactive } from '@openuidev/lang-core';
import type { z } from 'zod/v4';

import type { RenderContext, StateBinding } from './OpenUIRenderer';

/** Marks a prop as one a `$variable` can bind to: the model writes `$k` and the control reads and writes it. */
export function reactive<T extends z.ZodType>(schema: T): T {
  markReactive(schema);
  return schema;
}

/**
 * The value a control shows. Bound to a `$variable`, that variable decides it. Given a literal, the control keeps what
 * the student sets until the literal itself changes.
 */
export class Controlled<T> {
  private binding: StateBinding | null = null;
  private literal: unknown;
  private local: T | undefined;

  private latest: Record<string, unknown> = {};

  /** `show` draws the control from its props. It runs again after an unbound write, since nothing else would redraw the control. */
  constructor(
    private readonly ctx: RenderContext,
    private readonly show: (props: Record<string, unknown>) => void,
  ) {}

  readonly update = (props: Record<string, unknown>): void => {
    this.latest = props;
    this.show(props);
  };

  read(prop: unknown): T {
    const binding = this.ctx.bind(prop);
    this.binding = binding;
    if (binding.bound) return binding.value as T;
    if (!Object.is(binding.value, this.literal)) {
      this.literal = binding.value;
      this.local = undefined;
    }
    return (this.local ?? binding.value) as T;
  }

  write(value: T): void {
    this.local = value;
    if (this.binding?.bound) this.binding.set(value);
    else this.show(this.latest);
  }
}
