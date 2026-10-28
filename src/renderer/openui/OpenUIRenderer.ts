import type { ElementNode, EvaluationContext, Library, ParseResult, Store, StreamParser } from '@openuidev/lang-core';
import { createStore, createStreamingParser, evaluateRoot, resolveStateField } from '@openuidev/lang-core';
import { StrictCalls, type StrictSource } from './strictSource';

/** A prop that may be bound to a `$variable`. Unbound, `value` is the literal and `set` does nothing. */
export interface StateBinding {
  readonly value: unknown;
  readonly bound: boolean;
  set(value: unknown): void;
}

export interface RenderContext {
  /** Renders Markdown into `el` with the host's renderer, replacing what was there. */
  renderMarkdown(el: HTMLElement, markdown: string): void;
  /** Reconciles `host`'s children with `value`. The renderer owns every child of `host`. */
  renderChildren(host: HTMLElement, value: unknown): void;
  /** Reads and writes the `$variable` a reactive prop is bound to. Writing redraws every reader. */
  bind(prop: unknown): StateBinding;
  /** Whether anything is listening for a message from a component. */
  readonly canSend: boolean;
  /** Sends `message` as the student's next message. False when the chat cannot take one now, or nothing listens. */
  send(message: string): boolean;
}

export interface MountedComponent {
  readonly el: HTMLElement;
  update(props: Record<string, unknown>): void;
  /** Called when the renderer drops the component, to stop timers and listeners. */
  destroy?(): void;
}

export type ComponentFactory = ((ctx: RenderContext) => MountedComponent) & {
  /** Gets its arguments as written, without the parser's repairs, so it can reject the whole figure (`strictSource.ts`). */
  readonly strict?: boolean;
};

export function strictComponent(factory: (ctx: RenderContext) => MountedComponent): ComponentFactory {
  return Object.assign(factory, { strict: true });
}

/** For a node its parent reads as data; it never mounts on its own. */
export const dataComponent: ComponentFactory = () => ({ el: document.createElement('span'), update: () => undefined });

interface Slot {
  readonly typeName: string;
  readonly mounted: MountedComponent;
  /** Set when the component failed to draw; `mounted` then shows this message. */
  readonly error?: string;
}

/** What evaluating a response needs: the variables' values and the library's functions. */
export function evaluationContext(library: Library<ComponentFactory>, store: Store, reportError: (message: string) => void): EvaluationContext {
  const functions = Object.fromEntries(
    Object.entries(library.toJSONSchema().functions ?? {}).map(([name, spec]) => [name, { ...spec, fn: library.functions![name]!.fn }]),
  );
  return { getState: (name) => store.get(name), resolveRef: () => undefined, functions, reportError };
}

export class OpenUIRenderer implements RenderContext {
  isStreaming = false;
  private readonly parser: StreamParser;
  private readonly slots = new Map<HTMLElement, Map<string, Slot | Text>>();
  /** Each renderer holds its own variables, so two figures never share a `$k`. */
  private readonly store: Store = createStore();
  private readonly evaluation: EvaluationContext;
  private readonly strict: StrictCalls;
  private result: ParseResult | null = null;
  private text = '';
  private source: StrictSource;
  private failures: string[] = [];
  private problems: { readonly el: HTMLElement; readonly key: string } | undefined;
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly library: Library<ComponentFactory>,
    readonly renderMarkdown: (el: HTMLElement, markdown: string) => void,
    private readonly sendMessage?: (message: string) => boolean,
  ) {
    this.evaluation = evaluationContext(library, this.store, (message) => console.debug('[clew] OpenUI:', message));
    this.strict = new StrictCalls(library, this.evaluation);
    this.source = this.strict.source('');
    this.parser = createStreamingParser(this.strict.schema(library.toJSONSchema()), library.root);
  }

  /** Renders the whole response so far. Call with `complete` once the stream ends. */
  set(text: string, complete = false): ParseResult {
    this.text = text;
    this.source = this.strict.source(text);
    const parsed = this.parser.set(this.source.text, complete);
    const result = this.source.incomplete ? { ...parsed, meta: { ...parsed.meta, incomplete: true } } : parsed;
    this.isStreaming = !complete;
    this.result = result;
    // A declared default replaces an earlier default, never a value the student has set.
    this.store.initialize(result.stateDeclarations, {});
    this.draw();
    return result;
  }

  /** What the last complete draw could not show as written: the parser's repairs, and each component that failed to draw. */
  get errors(): readonly string[] {
    return [...this.repairs(), ...this.failures];
  }

  /** Removes every component. */
  destroy(): void {
    this.destroyed = true;
    this.renderChildren(this.host, null);
    this.problems?.el.remove();
  }

  get canSend(): boolean {
    return this.sendMessage !== undefined;
  }

  send(message: string): boolean {
    return this.sendMessage?.(message) ?? false;
  }

  bind(prop: unknown): StateBinding {
    const field = resolveStateField('', prop, this.store, this.evaluation, () => undefined, () => undefined);
    return {
      value: field.value,
      bound: field.isReactive,
      set: (value) => {
        field.setValue(value);
        this.draw();
      },
    };
  }

  private draw(): void {
    if (this.destroyed || !this.result) return;
    this.failures = [];
    this.renderChildren(this.host, evaluateRoot(this.result, { ctx: this.evaluation, library: this.library, store: this.store }));
    this.report();
  }

  /** The parser's repairs; lang-core's message ends with advice for the model, which the student does not need. */
  private repairs(): string[] {
    return (this.result?.meta.errors ?? []).filter((error) => error.severity !== 'warning').map((error) => `${error.component}: ${error.message.split(' — ')[0]}`);
  }

  /**
   * After the components: the repairs, which have no place of their own (a failed component shows its error in place),
   * and the source to inspect. Rebuilt only when they change, so an open source block stays open across redraws.
   */
  private report(): void {
    const repairs = this.isStreaming ? [] : this.repairs();
    const key = repairs.length || this.failures.length ? JSON.stringify([repairs, this.text]) : '';
    if (key === (this.problems?.key ?? '')) {
      if (this.problems && this.host.lastChild !== this.problems.el) this.host.append(this.problems.el);
      return;
    }
    this.problems?.el.remove();
    this.problems = undefined;
    if (!key) return;
    const el = this.host.appendChild(document.createElement('div'));
    for (const repair of repairs) {
      const line = el.appendChild(document.createElement('div'));
      line.className = 'clew-visual-error';
      line.textContent = repair;
    }
    const details = el.appendChild(document.createElement('details'));
    details.className = 'clew-visual-source';
    details.appendChild(document.createElement('summary')).textContent = 'Visual source';
    details.appendChild(document.createElement('pre')).textContent = this.text;
    this.problems = { el, key };
  }

  renderChildren(host: HTMLElement, value: unknown): void {
    const previous = this.slots.get(host) ?? new Map<string, Slot | Text>();
    const next = new Map<string, Slot | Text>();
    const children: Node[] = [];
    const counts = new Map<string, number>();
    // Unresolved references drop out of child arrays mid-stream, so inline nodes are keyed by
    // their order among same-type inline siblings, not by array index.
    const nextKey = (prefix: string) => {
      const n = counts.get(prefix) ?? 0;
      counts.set(prefix, n + 1);
      return `${prefix}#${n}`;
    };

    for (const item of [value].flat(Infinity)) {
      if (item == null) continue;
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        const key = nextKey('#text');
        const old = previous.get(key);
        const text = old instanceof Text ? old : document.createTextNode('');
        if (text.data !== String(item)) text.data = String(item);
        next.set(key, text);
        children.push(text);
        continue;
      }
      if (!isElementNode(item)) continue;
      const key = item.statementId ?? nextKey(item.typeName);
      const slot = this.renderElement(item, previous.get(key));
      if (!slot) continue;
      next.set(key, slot);
      children.push(slot.mounted.el);
    }

    for (const [key, old] of previous) {
      if (next.get(key) === old) continue;
      nodeOf(old).remove();
      if (!(old instanceof Text)) this.drop(old);
    }
    // Moving a focused element blurs it, so only insert nodes that are out of place.
    let cursor = host.firstChild;
    for (const node of children) {
      if (node === cursor) cursor = cursor.nextSibling;
      else host.insertBefore(node, cursor);
    }
    if (next.size) this.slots.set(host, next);
    else this.slots.delete(host);
  }

  /** Destroys a removed component and every component drawn inside it, so none keeps a timer running. */
  private drop(slot: Slot): void {
    for (const [host, children] of this.slots) {
      if (host === this.host || !slot.mounted.el.contains(host)) continue;
      this.slots.delete(host);
      for (const child of children.values()) if (!(child instanceof Text)) child.mounted.destroy?.();
    }
    slot.mounted.destroy?.();
  }

  private renderElement(node: ElementNode, old: Slot | Text | undefined): Slot | null {
    const factory = this.library.components[node.typeName]?.component;
    if (!factory) return null;
    let fresh: Slot | undefined;
    try {
      const props = this.source.propsOf(node);
      if (old && !(old instanceof Text) && !old.error && old.typeName === node.typeName) {
        old.mounted.update(props);
        return old;
      }
      fresh = { typeName: node.typeName, mounted: factory(this) };
      fresh.mounted.update(props);
      return fresh;
    } catch (error) {
      if (fresh) this.drop(fresh);
      // Partial props mid-stream can throw; the next chunk retries with a fresh mount.
      if (this.isStreaming) return null;
      const message = `${node.typeName}: ${error instanceof Error ? error.message : String(error)}`;
      this.failures.push(message);
      if (old && !(old instanceof Text) && old.error === message) return old;
      const el = document.createElement('div');
      el.className = 'clew-visual-error';
      el.textContent = message;
      return { typeName: node.typeName, mounted: { el, update: () => undefined }, error: message };
    }
  }
}

function isElementNode(value: unknown): value is ElementNode {
  return typeof value === 'object' && value !== null && (value as ElementNode).type === 'element';
}

function nodeOf(entry: Slot | Text): ChildNode {
  return entry instanceof Text ? entry : entry.mounted.el;
}
