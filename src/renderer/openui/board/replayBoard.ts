import { atStep, id, integer, list, record, requireThat, step, steps, tag, targets, text, type TagValue } from '../steps/validation';

interface BoardRegion {
  readonly id: string;
  readonly label: string;
  readonly slots: number;
  readonly cols: number;
}
interface BoardBlock {
  readonly id: string;
  readonly region: string;
  readonly slot: number;
  readonly label: string;
  readonly tag: TagValue;
  readonly copiedFrom?: string;
}
interface BoardSnapshot {
  readonly caption: string;
  readonly blocks: readonly BoardBlock[];
}
export interface BoardReplay {
  readonly regions: readonly BoardRegion[];
  readonly snapshots: readonly BoardSnapshot[];
}

function splitMoves(value: string): string[] {
  const moves: string[] = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "'") quoted = !quoted;
    if (value[i] === ';' && !quoted) { moves.push(value.slice(start, i).trim()); start = i + 1; }
  }
  requireThat(!quoted, 'unclosed label quote');
  moves.push(value.slice(start).trim());
  return moves.filter(Boolean);
}

export function replayBoard(props: Record<string, unknown>): BoardReplay {
  const regions = list(props.regions, 32).map(value => {
    const r = record(value);
    const slots = integer(r.slots, 1, 512);
    return Object.freeze({ id: id(r.id), label: text(r.label), slots, cols: integer(r.cols === undefined ? slots : r.cols, 1, slots) });
  });
  const capacities = new Map(regions.map(r => [r.id, r.slots]));
  requireThat(capacities.size === regions.length, 'duplicate region ID');
  requireThat(regions.reduce((sum, r) => sum + r.slots, 0) <= 512, 'aggregate slots exceed 512');
  const state = new Map<string, BoardBlock>();
  /** Labels set before their block exists; once created, a block carries its own. */
  const pending = new Map<string, string>();
  const occupants = new Map<string, string>();
  const copies = new Map<string, number>();
  const ever = new Set<string>();
  const reserved = (key: string) => /_copy\d*$/.test(key);
  const born = (key: string) => { ever.add(key); requireThat(ever.size <= 256, 'distinct block IDs exceed 256'); };
  const at = (region: string, slot: number) => `${region}:${slot}`;
  const put = (block: BoardBlock) => {
    const old = state.get(block.id);
    if (old) occupants.delete(at(old.region, old.slot));
    state.set(block.id, block);
    occupants.set(at(block.region, block.slot), block.id);
  };
  const remove = (key: string) => {
    const old = state.get(key)!;
    occupants.delete(at(old.region, old.slot));
    state.delete(key);
  };
  const occupant = (region: string, slot: number) => occupants.get(at(region, slot));
  const destination = (region: string, slot: string | undefined, except?: string) => {
    const capacity = capacities.get(region);
    requireThat(capacity !== undefined, `unknown region ${region}`);
    if (slot !== undefined) return integer(Number(slot), 0, capacity - 1);
    for (let s = 0; s < capacity; s++) {
      const key = occupant(region, s);
      if (key === undefined || key === except) return s;
    }
    throw new Error(`full region ${region}`);
  };
  const blockList = (value: string) => targets(value.trim().split(/\s+/), true);
  let count = 0;
  const snapshots = steps(props.steps).map((value, index) => atStep(index, () => {
    const { caption, changes } = step(value);
    requireThat(typeof changes === 'string', 'Board requires a move string');
    for (const move of splitMoves(changes)) {
      requireThat(++count <= 4096, 'moves exceed 4096');
      let m: RegExpMatchArray | null;
      if ((m = move.match(/^(\S+)\s*=\s*'([^']*)'$/))) {
        const key = id(m[1]);
        requireThat(!reserved(key) || state.has(key), 'unknown reserved copy ID');
        const label = text(m[2]);
        born(key);
        const old = state.get(key);
        if (old) put({ ...old, label });
        else pending.set(key, label);
      } else if ((m = move.match(/^(\S+)\s*>>\s*(\w+)(?::(\d+))?$/))) {
        const sourceId = id(m[1]);
        const source = state.get(sourceId);
        requireThat(source, `copy unknown block ${sourceId}`);
        const region = id(m[2]);
        const slot = destination(region, m[3]);
        const victim = occupant(region, slot);
        requireThat(victim !== sourceId, 'copy cannot replace its source');
        const n = (copies.get(sourceId) ?? 0) + 1;
        const key = id(`${sourceId}_copy${n === 1 ? '' : n}`);
        requireThat(!ever.has(key), 'copy identity collision');
        born(key);
        if (victim !== undefined) remove(victim);
        copies.set(sourceId, n);
        put({ id: key, region, slot, label: source.label, tag: 'plain', copiedFrom: sourceId });
      } else if ((m = move.match(/^(.+?)\s*>\s*(\w+)(?::(\d+))?$/))) {
        const keys = blockList(m[1]);
        const region = id(m[2]);
        requireThat(m[3] === undefined || keys.length === 1, 'explicit slot requires one block');
        for (const key of keys) {
          const old = state.get(key);
          requireThat(old || !reserved(key), 'reserved copy ID cannot be created by a move');
          const slot = destination(region, m[3], key);
          const victim = occupant(region, slot);
          requireThat(victim === undefined || victim === key, `occupied slot ${region}:${slot}`);
          born(key);
          put({ ...old, id: key, region, slot, label: old?.label ?? pending.get(key) ?? key, tag: old?.tag ?? 'plain' });
          pending.delete(key);
        }
      } else if ((m = move.match(/^(.+?)\s*~\s*(\w*)$/))) {
        const value = tag(m[2] || undefined);
        for (const key of blockList(m[1])) {
          const old = state.get(key);
          requireThat(old, `tag unknown block ${key}`);
          put({ ...old, tag: value });
        }
      } else if ((m = move.match(/^-\s*(.+)$/))) {
        for (const key of blockList(m[1])) {
          requireThat(state.has(key), `remove unknown block ${key}`);
          remove(key);
        }
      } else throw new Error(`malformed move: ${move}`);
    }
    return Object.freeze({ caption, blocks: Object.freeze([...state.values()].map(b => Object.freeze(b))) });
  }));
  return Object.freeze({ regions: Object.freeze(regions), snapshots: Object.freeze(snapshots) });
}
