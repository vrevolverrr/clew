import { replayBoard } from '@/renderer/openui/board/replayBoard';

const step = (changes: unknown, caption = 'A step') => ({ typeName: 'Step', props: { caption, changes } });
const regions = [{ id: 'disk', label: 'Disk', slots: 4 }, { id: 'ram', label: 'Memory', slots: 4, cols: 2 }];
const replay = (changes: string[]) => replayBoard({ regions, steps: changes.map(s => step(s)) });

describe('Board replay', () => {
  it('places in order, uses the current slot as free, and keeps tags and labels on moves', () => {
    const states = replay(["A = 'a;b'; A B C > disk; A ~ active", 'A B > ram', 'B > ram', 'B ~']).snapshots;
    expect(states[0].blocks).toEqual([
      { id: 'A', region: 'disk', slot: 0, label: 'a;b', tag: 'active' },
      { id: 'B', region: 'disk', slot: 1, label: 'B', tag: 'plain' },
      { id: 'C', region: 'disk', slot: 2, label: 'C', tag: 'plain' },
    ]);
    expect(states[1].blocks[0]).toMatchObject({ region: 'ram', slot: 0, label: 'a;b', tag: 'active' });
    expect(states[2].blocks[1]).toMatchObject({ slot: 1 });
    expect(states[3].blocks[1].tag).toBe('plain');
  });

  it('swaps using a temporary slot while validating occupancy after every move', () => {
    const states = replay(['A B > ram', 'A > ram:2; B > ram:0; A > ram:1']).snapshots;
    expect(states[1].blocks.map(b => [b.id, b.slot])).toEqual([['A', 1], ['B', 0]]);
    expect(() => replay(['A B > ram', 'A > ram:1; B > ram:0'])).toThrow('Step 2: occupied slot');
  });

  it('copies independently, preserves originals, replaces explicit occupants, and resets copy tags', () => {
    const states = replay(["A > disk; A = 'Original'; A ~ done; Z > ram", 'A >> ram:0', "A = 'Changed'; A_copy ~ active", 'A_copy >> ram:1']).snapshots;
    expect(states[1].blocks.map(b => b.id)).toEqual(['A', 'A_copy']);
    expect(states[1].blocks[1]).toMatchObject({ label: 'Original', tag: 'plain', copiedFrom: 'A' });
    expect(states[2].blocks[1].label).toBe('Original');
    expect(states[3].blocks[2]).toMatchObject({ id: 'A_copy_copy', label: 'Original', tag: 'plain' });
    for (const state of states) expect(state.blocks.find(b => b.id === 'A')).toMatchObject({ region: 'disk', slot: 0 });
  });

  it('keeps copy counters across deletion/recreation and repeated replay, with immutable snapshots', () => {
    const program = ['A > disk; A >> ram', '-A_copy; A >> ram', '-A; A > disk; A >> ram'];
    const result = replay(program);
    expect(result.snapshots[2].blocks.map(b => b.id)).toEqual(['A_copy2', 'A', 'A_copy3']);
    expect(replay(program)).toEqual(result);
    expect(() => { (result.snapshots[0].blocks[0] as { label: string }).label = 'corrupt'; }).toThrow();
    expect(Object.isFrozen(result.snapshots[0].blocks)).toBe(true);
  });

  it('removes labels and tags on deletion, without creating staged labels', () => {
    const states = replay(["Future = 'Later'", "A > disk; A = 'Old'; A ~ done", '-A; A > disk; Future > ram']).snapshots;
    expect(states[0].blocks).toEqual([]);
    expect(states[2].blocks).toEqual([
      { id: 'A', region: 'disk', slot: 0, label: 'A', tag: 'plain' },
      { id: 'Future', region: 'ram', slot: 0, label: 'Later', tag: 'plain' },
    ]);
  });

  it('handles special property names, empty regions and caption-only steps', () => {
    const result = replayBoard({ regions: [{ id: '__proto__', label: 'Place', slots: 1 }], steps: [step("constructor = 'Safe'; constructor > __proto__"), step('')] });
    expect(result.snapshots[1].blocks[0]).toMatchObject({ id: 'constructor', region: '__proto__', label: 'Safe' });
    expect(replayBoard({ regions: [], steps: [step('')] }).snapshots[0].blocks).toEqual([]);
  });

  it.each([
    ['A A > ram', 'repeated'], ['A > ram; A A ~ active', 'repeated'], ['A > ram; -A A', 'repeated'],
    ['A B > ram:0', 'one block'], ['A > unknown', 'unknown region'], ['A > ram:4', 'integer'],
    ['A B C D E > ram', 'full region'], ['A_copy > ram', 'reserved'], ['A_copy23 > ram', 'reserved'],
    ["A_copy = 'x'", 'reserved'], ['A >> ram', 'copy unknown'], ['A > ram; A >> ram:0', 'source'],
    ['A B C D > ram; A >> ram', 'full region'], ['A ~ done', 'tag unknown'], ['-A', 'remove unknown'],
    ['A > ram; A ~ plain', 'unsupported tag'], ['A > ram; A ~ wrong', 'unsupported tag'],
    ["A = 'unfinished", 'unclosed'], ["A = 'can\'t'", 'unclosed'], ['not a move', 'malformed'],
    ['A > ram:-1', 'malformed'], ['A > ram:1.5', 'malformed'], ['1A > ram', 'invalid ID'],
  ])('rejects %s without exposing a partial replay', (changes, message) => {
    expect(() => replay([changes])).toThrow(message);
  });

  it.each([
    { regions: [...regions, regions[0]], steps: [step('')] },
    { regions: [{ id: 'r', label: 'R', slots: 0 }], steps: [step('')] },
    { regions: [{ id: 'r', label: 'R', slots: 2, cols: 3 }], steps: [step('')] },
    { regions: [{ id: 'r', label: 'R', slots: 2, cols: null }], steps: [step('')] },
    { regions: [{ id: 'r', label: 'R', slots: '2' }], steps: [step('')] },
    { regions, steps: [] }, { regions, steps: [step([], 'Caption')] },
    { regions, steps: [step('', ' ')] }, { regions, steps: [{ typeName: 'Other', props: {} }] },
  ])('rejects invalid figure structure %#', props => { expect(() => replayBoard(props)).toThrow(); });

  it('keeps all ten disk originals in every block-join snapshot', () => {
    const originals = ['R0', 'R1', 'R2', 'R3', 'R4', 'S0', 'S1', 'S2', 'S3', 'S4'];
    const moves = [originals.join(' ') + ' > disk'];
    for (let r = 0; r < 5; r++) {
      moves.push(`R${r} >> memory:0`);
      for (let s = 0; s < 5; s++) {
        const copy = `S${s}_copy${r === 0 ? '' : r + 1}`;
        moves.push(`S${s} >> memory:1`, `${copy} ~ active`, `-${copy}`);
      }
      moves.push(`-R${r}_copy`);
    }
    const result = replayBoard({ regions: [{ id: 'disk', label: 'Disk', slots: 10 }, { id: 'memory', label: 'Memory', slots: 2 }], steps: moves.map(m => step(m)) });
    for (const snapshot of result.snapshots) {
      expect(snapshot.blocks.filter(b => b.region === 'disk').map(b => [b.id, b.slot])).toEqual(originals.map((key, slot) => [key, slot]));
    }
  });

  it('enforces limits before building a replay', () => {
    expect(() => replayBoard({ regions: Array.from({ length: 33 }, (_, i) => ({ id: `r${i}`, label: '', slots: 1 })), steps: [step('')] })).toThrow('32');
    expect(() => replayBoard({ regions: [{ id: 'r', label: '', slots: 512 }, { id: 's', label: '', slots: 1 }], steps: [step('')] })).toThrow('aggregate');
    expect(() => replayBoard({ regions, steps: Array.from({ length: 257 }, () => step('')) })).toThrow('256');
    expect(() => replay([`A > disk; ${Array.from({ length: 4096 }, () => 'A ~').join(';')}`])).toThrow('4096');
    expect(() => replay([`${'A'.repeat(129)} > disk`])).toThrow('ID');
    expect(() => replay([`A = '${'x'.repeat(2001)}'`])).toThrow('2000');
    expect(() => replayBoard({ regions, steps: [step('', 'x'.repeat(2001))] })).toThrow('2000');
    expect(() => replayBoard({ regions: [{ id: 'r', label: '', slots: 512 }], steps: [step(Array.from({ length: 257 }, (_, i) => `b${i}`).join(' ') + ' > r')] })).toThrow('distinct block');
    expect(() => replay([Array.from({ length: 257 }, (_, i) => `b${i} = 'Future'`).join(';')])).toThrow('distinct block');
  });

  it('matches an independent slot-array oracle through seeded copy/move/delete programs', () => {
    for (let seed = 1; seed <= 64; seed++) {
      let rng = seed;
      const random = (n: number) => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng % n; };
      const slots: (string | null)[] = Array(16).fill(null);
      slots[0] = 'A';
      const counts = new Map<string, number>();
      const changes = ['A > r:0'];
      const expected: string[][] = [['A:0']];
      for (let k = 1; k < 64; k++) {
        const used = slots.flatMap((v, i) => v === null ? [] : [i]);
        const source = used[random(used.length)];
        const target = random(slots.length);
        const key = slots[source]!;
        if (source !== target && random(2)) {
          const count = (counts.get(key) ?? 0) + 1;
          counts.set(key, count);
          const copy = `${key}_copy${count === 1 ? '' : count}`;
          // Deep chains are valid only while generated IDs stay within the ID limit.
          if (copy.length > 128) { changes.push(''); }
          else { changes.push(`${key} >> r:${target}`); slots[target] = copy; }
        } else if (slots[target] === null || target === source) {
          changes.push(`${key} > r:${target}`); slots[source] = null; slots[target] = key;
        } else if (used.length > 1) { changes.push(`-${key}`); slots[source] = null; }
        else changes.push('');
        expected.push(slots.flatMap((v, i) => v === null ? [] : [`${v}:${i}`]).sort());
      }
      const props = { regions: [{ id: 'r', label: 'R', slots: 16 }], steps: changes.map(s => step(s)) };
      const result = replayBoard(props);
      expect(result.snapshots.map(s => s.blocks.map(b => `${b.id}:${b.slot}`).sort())).toEqual(expected);
      expect(replayBoard(props)).toEqual(result);
    }
  });
});
