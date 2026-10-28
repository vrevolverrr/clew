import { defineFunction } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { compileExpression } from './Expression';

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAMPLES = 240;

const EXPRESSION_HELP =
  'Expressions use the names in vars, pi, e, + - * / ^ %, sum(k, from, to, body), prod(k, from, to, body), and sin cos tan asin acos atan atan2 exp ln log10 sqrt abs floor ceil round min max pow fact normpdf(x, mu, sigma) normcdf(x, mu, sigma).';

/** The named numbers a model passes to an expression. `x` is the curve's own variable, so it cannot be one of them. */
function variableScope(vars: Record<string, number> | undefined): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const [name, value] of Object.entries(vars ?? {})) {
    if (!NAME.test(name) || name === 'x') throw new Error(`Cannot use ${name} as a variable name`);
    scope[name] = value;
  }
  return scope;
}

export const Eval = defineFunction({
  name: 'Eval',
  description: 'One number from an expression in the names of vars, for a Stat or a Dot. Same rules as Curve.',
  params: z.object({ expr: z.string(), vars: z.record(z.string(), z.number()).optional() }),
  returns: z.number().nullable(),
  fn: ({ expr, vars }) => {
    const scope = variableScope(vars);
    const value = compileExpression(expr, Object.keys(scope))(scope);
    return Number.isFinite(value) ? value : null;
  },
});

export const Curve = defineFunction({
  name: 'Curve',
  description: `Points of y = f(x) from x0 to x1 for a Line or Area; expr is written in x. An undefined point is a gap. ${EXPRESSION_HELP}`,
  params: z.object({
    expr: z.string(),
    x0: z.number(),
    x1: z.number(),
    vars: z.record(z.string(), z.number()).optional(),
  }),
  returns: z.array(z.array(z.number().nullable())),
  fn: ({ expr, x0, x1, vars }) => {
    const scope = variableScope(vars);
    const f = compileExpression(expr, ['x', ...Object.keys(scope)]);
    return Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / SAMPLES;
      const y = f({ ...scope, x });
      return [x, Number.isFinite(y) ? y : null];
    });
  },
});
