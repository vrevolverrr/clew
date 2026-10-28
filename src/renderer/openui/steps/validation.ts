export type TagValue = 'plain' | 'active' | 'done' | 'dim';

export function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function record(value: unknown): Record<string, unknown> {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 'expected an object');
  return value as Record<string, unknown>;
}

export function list(value: unknown, max: number): unknown[] {
  requireThat(Array.isArray(value), 'expected a list');
  requireThat(value.length <= max, `list exceeds ${max} entries`);
  return value;
}

export function text(value: unknown): string {
  requireThat(typeof value === 'string' && value.length <= 2000, 'expected text of at most 2000 characters');
  return value;
}

export function id(value: unknown): string {
  requireThat(typeof value === 'string' && value.length <= 128 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value), 'invalid ID');
  return value;
}

export function integer(value: unknown, min: number, max: number): number {
  requireThat(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max, `expected integer ${min}..${max}`);
  return value;
}

export function boolean(value: unknown): boolean {
  requireThat(value === undefined || typeof value === 'boolean', 'expected a boolean');
  return value === true;
}

export function tag(value: unknown): TagValue {
  requireThat(value === undefined || value === 'active' || value === 'done' || value === 'dim', 'unsupported tag');
  return value ?? 'plain';
}

export function targets(value: unknown, unique = false): string[] {
  const ids = (Array.isArray(value) ? value : [value]).map(id);
  requireThat(!unique || new Set(ids).size === ids.length, 'repeated block ID');
  return ids;
}

/** Bounded, canonical JSON identity; also runs before any replay, grid or layout allocation. */
export function figureKey(props: Record<string, unknown>): string {
  let bytes = 0;
  const add = (s: string) => {
    for (const ch of s) {
      const code = ch.codePointAt(0)!;
      bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
      requireThat(bytes <= 256 * 1024, 'serialized props exceed 256 KiB');
    }
    return s;
  };
  const visit = (v: unknown, depth: number): string => {
    requireThat(depth < 16, 'props are nested too deeply');
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') {
      requireThat(typeof v !== 'number' || Number.isFinite(v), 'invalid number');
      return add(JSON.stringify(v));
    }
    if (Array.isArray(v)) return add('[') + v.map((x, i) => (i ? add(',') : '') + visit(x, depth + 1)).join('') + add(']');
    const obj = record(v);
    return add('{') + Object.keys(obj).filter(k => obj[k] !== undefined).sort().map((k, i) => (i ? add(',') : '') + add(JSON.stringify(k)) + add(':') + visit(obj[k], depth + 1)).join('') + add('}');
  };
  return visit(props, 0);
}

export function steps(value: unknown): unknown[] {
  const all = list(value, 256);
  requireThat(all.length > 0, 'at least one Step is required');
  return all;
}

/** An evaluated component node whose type is one of `typeNames`. */
export function operation(value: unknown, typeNames: readonly string[]): { typeName: string; props: Record<string, unknown> } {
  const node = record(value);
  const typeName = String(node.typeName);
  requireThat(typeNames.includes(typeName), typeNames.length === 1 ? `expected ${typeNames[0]}` : 'unknown operation');
  return { typeName, props: record(node.props) };
}

export function step(value: unknown): { caption: string; changes: unknown } {
  const { props } = operation(value, ['Step']);
  const caption = text(props.caption);
  requireThat(caption.trim().length > 0, 'empty caption');
  return { caption, changes: props.changes };
}

export function atStep<T>(index: number, run: () => T): T {
  try { return run(); }
  catch (error) { throw new Error(`Step ${index + 1}: ${error instanceof Error ? error.message : String(error)}`); }
}
