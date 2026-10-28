import { autoClose, evaluate, parseExpression, split, tokenize, walkAST, type ASTNode, type ElementNode, type EvaluationContext, type Library, type LibraryJSONSchema } from '@openuidev/lang-core';

import type { ComponentFactory } from './OpenUIRenderer';

type Props = Record<string, unknown>;
type Outcome = { readonly props: Props } | { readonly error: unknown };

export interface StrictSource {
  /** The program with each strict call replaced by a numbered handle that the parser accepts as written. */
  readonly text: string;
  /** Whether the program was cut short; the parser sees the auto-closed text and cannot tell. */
  readonly incomplete: boolean;
  /** The props to draw `node` with: for a strict call, evaluated from its original syntax. Throws what is wrong with them. */
  propsOf(node: ElementNode): Props;
}

/**
 * The parser repairs a call it can't validate: it drops invalid arguments, unknown calls and missing references, even
 * inside lists, and reports them only against the enclosing statement. A strict component must reject such a figure
 * rather than draw a changed one, so its calls bypass the parser and are evaluated here from the syntax as written.
 */
export class StrictCalls {
  private readonly names: ReadonlySet<string>;
  private readonly call: RegExp | undefined;
  private readonly parameters: ReadonlyMap<string, readonly string[]>;

  constructor(library: Library<ComponentFactory>, private readonly context: EvaluationContext) {
    const components = Object.entries(library.components);
    this.names = new Set(components.filter(([, c]) => c.component.strict).map(([name]) => name));
    this.call = this.names.size ? new RegExp(`\\b(?:${[...this.names].join('|')})\\s*\\(`) : undefined;
    this.parameters = new Map(components.map(([name, c]) => [name, Object.keys(c.props.shape)]));
  }

  /** The parser's schema, with each strict component taking only its handle. */
  schema(schema: LibraryJSONSchema): LibraryJSONSchema {
    return { ...schema, $defs: Object.fromEntries(Object.entries(schema.$defs ?? {}).map(([name, definition]) => [name,
      this.names.has(name) ? { type: 'object', properties: { strictIndex: { type: 'number' } }, required: ['strictIndex'] } : definition,
    ])) };
  }

  source(text: string): StrictSource {
    if (!this.call?.test(text)) return { text, incomplete: false, propsOf: (node) => node.props };
    const closed = autoClose(text);
    const definitions = new Map(split(tokenize(closed.text)).map(s => [s.id, parseExpression(s.tokens)]));
    const originals: ASTNode[] = [];
    const rewrite = (node: ASTNode): ASTNode => {
      if (node.k === 'Comp' && this.names.has(node.name) && !node.fn) {
        originals.push(node);
        return { ...node, args: [{ k: 'Num', v: originals.length - 1 }] };
      }
      return mapChildren(node, rewrite);
    };
    const rewritten = [...definitions].map(([id, node]) => `${id} = ${serialize(rewrite(node))}`).join('\n');
    const readsState = stateReader(definitions);
    const evaluateCall = materializer(definitions, readsState, this.parameters, this.context);
    // A call that reads no $variable evaluates the same on every redraw, so it is evaluated once.
    const fixed = originals.map(node => (readsState(node) ? undefined : settle(() => evaluateCall(node))));
    return { text: rewritten, incomplete: closed.wasIncomplete, propsOf: lookup(this.names, fixed, originals, evaluateCall) };
  }
}

/** Built apart from `source` so a program whose calls are all fixed keeps none of its syntax alive. */
function lookup(names: ReadonlySet<string>, fixed: readonly (Outcome | undefined)[], originals: readonly ASTNode[], evaluateCall: (node: ASTNode) => Props): (node: ElementNode) => Props {
  const live = fixed.includes(undefined) ? { originals, evaluateCall } : undefined;
  return node => {
    if (!names.has(node.typeName)) return node.props;
    const index = Number(node.props.strictIndex);
    const outcome = fixed[index] ?? settle(() => live!.evaluateCall(live!.originals[index]));
    if ('error' in outcome) throw outcome.error;
    return outcome.props;
  };
}

function settle(run: () => Props): Outcome {
  try { return { props: run() }; }
  catch (error) { return { error }; }
}

/** Whether a node reads a $variable, directly or through the definitions it names. Each definition is walked once. */
function stateReader(definitions: ReadonlyMap<string, ASTNode>): { (node: ASTNode): boolean; definition(name: string): boolean } {
  const memo = new Map<string, boolean>();
  const definition = (name: string): boolean => {
    const known = memo.get(name);
    if (known !== undefined) return known;
    memo.set(name, false);
    const node = definitions.get(name);
    const reads = node !== undefined && readsState(node);
    memo.set(name, reads);
    return reads;
  };
  const readsState = (node: ASTNode): boolean => {
    let found = false;
    walkAST(node, n => {
      if (!found) found = n.k === 'StateRef' || ((n.k === 'Ref' || n.k === 'RuntimeRef') && definition(n.n));
    });
    return found;
  };
  return Object.assign(readsState, { definition });
}

function materializer(definitions: ReadonlyMap<string, ASTNode>, readsState: ReturnType<typeof stateReader>, parameters: ReadonlyMap<string, readonly string[]>, context: EvaluationContext): (node: ASTNode) => Props {
  // Definitions that read no $variable have one value for the whole response.
  const values = new Map<string, unknown>();
  return root => {
    const resolving = new Set<string>();
    // No $variable changes during one evaluation, so every definition is evaluated once per call. Without this,
    // `a = [b, b]`, `b = [c, c]`, ... takes exponential time.
    const evaluated = new Map(values);
    const resolve = (name: string): unknown => {
      if (evaluated.has(name)) return evaluated.get(name);
      if (resolving.has(name)) throw new Error(`cyclic reference ${name}`);
      const definition = definitions.get(name);
      if (!definition) throw new Error(`unknown reference ${name}`);
      resolving.add(name);
      const value = materialize(definition);
      resolving.delete(name);
      evaluated.set(name, value);
      if (!readsState.definition(name)) values.set(name, value);
      return value;
    };
    const scope = { ...context, resolveRef: resolve };
    const materialize = (node: ASTNode): unknown => {
      switch (node.k) {
        case 'Str': case 'Num': case 'Bool': return node.v;
        case 'Null': return null;
        case 'Arr': return node.els.map(materialize);
        case 'Obj': return Object.fromEntries(node.entries.map(([key, value]) => [key, materialize(value)]));
        case 'Ref': case 'RuntimeRef': return resolve(node.n);
        case 'Ph': throw new Error(`unresolved reference ${node.n}`);
        case 'StateRef': return context.getState(node.n);
        case 'Ternary': return materialize(materialize(node.cond) ? node.then : node.else);
        case 'Comp': {
          if (node.fn) return evaluate(node, scope);
          const names = parameters.get(node.name);
          if (!names) throw new Error(`unknown component ${node.name}`);
          if (node.args.length > names.length) throw new Error(`${node.name} takes ${names.length} argument(s), got ${node.args.length}`);
          return { typeName: node.name, props: Object.fromEntries(node.args.map((arg, i) => [names[i], materialize(arg)])) };
        }
        default: return evaluate(node, scope);
      }
    };
    return (materialize(root) as { props: Props }).props;
  };
}

function mapChildren(node: ASTNode, map: (node: ASTNode) => ASTNode): ASTNode {
  switch (node.k) {
    case 'Comp': return { ...node, args: node.args.map(map) };
    case 'Arr': return { ...node, els: node.els.map(map) };
    case 'Obj': return { ...node, entries: node.entries.map(([key, v]) => [key, map(v)]) };
    case 'BinOp': return { ...node, left: map(node.left), right: map(node.right) };
    case 'UnaryOp': return { ...node, operand: map(node.operand) };
    case 'Ternary': return { ...node, cond: map(node.cond), then: map(node.then), else: map(node.else) };
    case 'Member': return { ...node, obj: map(node.obj) };
    case 'Index': return { ...node, obj: map(node.obj), index: map(node.index) };
    case 'Assign': return { ...node, value: map(node.value) };
    default: return node;
  }
}

function serialize(node: ASTNode): string {
  switch (node.k) {
    case 'Str': return JSON.stringify(node.v);
    case 'Num': case 'Bool': return String(node.v);
    case 'Null': return 'null';
    case 'Ref': case 'StateRef': case 'RuntimeRef': case 'Ph': return node.n;
    case 'Comp': return `${node.fn ? '@' : ''}${node.name}(${node.args.map(serialize).join(',')})`;
    case 'Arr': return `[${node.els.map(serialize).join(',')}]`;
    case 'Obj': return `{${node.entries.map(([key, v]) => `${JSON.stringify(key)}:${serialize(v)}`).join(',')}}`;
    case 'BinOp': return `(${serialize(node.left)} ${node.op} ${serialize(node.right)})`;
    case 'UnaryOp': return `(${node.op}${serialize(node.operand)})`;
    case 'Ternary': return `(${serialize(node.cond)} ? ${serialize(node.then)} : ${serialize(node.else)})`;
    case 'Member': return `${serialize(node.obj)}.${node.field}`;
    case 'Index': return `${serialize(node.obj)}[${serialize(node.index)}]`;
    case 'Assign': return `${node.target} = ${serialize(node.value)}`;
  }
}
