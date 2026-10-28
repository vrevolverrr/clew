import { replayNetwork } from '@/renderer/openui/network/replayNetwork';
import { layoutNetwork } from '@/renderer/openui/network/layoutNetwork';

const op = (typeName: string, props: Record<string, unknown>) => ({ typeName, props });
const step = (changes: unknown, caption = 'A step') => op('Step', { caption, changes });
const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C', hidden: true }];
const edges = [{ id: 'ab', from: 'A', to: 'B', directed: true }, { id: 'ba', from: 'B', to: 'A', directed: true }, { id: 'parallel', from: 'A', to: 'B' }, { id: 'loop', from: 'A', to: 'A' }, { id: 'bc', from: 'B', to: 'C' }];
const replay = (changes: unknown[][]) => replayNetwork({ nodes, edges, steps: changes.map(c => step(c)) });

describe('Network replay and geometry', () => {
  it('addresses parallel, opposite and self-loop edges independently', () => {
    const result = replay([[op('Tag', { targets: ['ab', 'loop'], tag: 'active' })], [op('Tag', { targets: 'ba', tag: 'done' }), op('Label', { target: 'parallel', text: 'Quiet road' })]]);
    expect(result.snapshots[0].edges.map(e => [e.id, e.tag])).toEqual([['ab', 'active'], ['ba', 'plain'], ['parallel', 'plain'], ['loop', 'active'], ['bc', 'plain']]);
    expect(result.snapshots[1].edges[1].tag).toBe('done');
    expect(result.snapshots[1].edges[2].label).toBe('Quiet road');
    expect(replay([[op('Tag', { targets: ['A', 'A'], tag: 'done' })]]).snapshots[0].nodes[0].tag).toBe('done');
    expect(replay([[op('Tag', { targets: Array(5000).fill('A'), tag: 'done' })]]).snapshots[0].nodes[0].tag).toBe('done');
  });

  it('keeps hidden labels and tags, restoring them on Show, and clears tags', () => {
    const result = replay([[op('Label', { target: 'C', text: 'Future' }), op('Tag', { targets: 'C', tag: 'done' }), op('Tag', { targets: 'bc', tag: 'active' })], [op('Show', { ids: ['C', 'C'] })], [op('Hide', { ids: ['C', 'C'] })], [op('Show', { ids: 'C' }), op('Tag', { targets: 'bc' })]]);
    expect(result.snapshots[0].nodes[2]).toEqual({ id: 'C', label: 'Future', hidden: true, tag: 'done' });
    expect(result.snapshots[1].nodes[2]).toMatchObject({ hidden: false, label: 'Future', tag: 'done' });
    expect(result.snapshots[2].edges[4].tag).toBe('active');
    expect(result.snapshots[3].nodes[2].hidden).toBe(false);
    expect(result.snapshots[3].edges[4].tag).toBe('plain');
    expect(Object.isFrozen(result.snapshots[0].nodes[2])).toBe(true);
  });

  it.each([
    op('Tag', { targets: 'missing', tag: 'done' }), op('Tag', { targets: 'A-B', tag: 'active' }),
    op('Tag', { targets: 'A', tag: 'plain' }), op('Tag', { targets: [], tag: 'error' }),
    op('Label', { target: ['A'], text: 'No' }), op('Label', { target: 'A', text: 5 }),
    op('Show', { ids: 'ab' }), op('Hide', { ids: 'loop' }), op('Show', { ids: 'missing' }),
    op('Move', { targets: 'A' }),
  ])('rejects invalid operation %# with the step number', operation => {
    expect(() => replay([[], [operation]])).toThrow('Step 2:');
  });

  it('rejects invalid topology and types', () => {
    for (const props of [
      { nodes: [{ id: 'A' }, { id: 'A' }], edges: [] },
      { nodes, edges: [{ id: 'A', from: 'A', to: 'B' }] },
      { nodes, edges: [{ id: 'bad', from: 'A', to: 'unknown' }] },
      { nodes: [{ id: 'A', hidden: 1 }], edges: [] },
      { nodes, edges: [{ id: 'e', from: 'A', to: 'B', directed: 'true' }] },
    ]) expect(() => replayNetwork({ ...props, steps: [step([])] })).toThrow();
    expect(() => replayNetwork({ nodes, edges, steps: [step('A > B')] })).toThrow('Step 1:');
  });

  it('accepts empty graphs and special property names', () => {
    expect(replayNetwork({ nodes: [], edges: [], steps: [step([])] }).snapshots[0].nodes).toEqual([]);
    const result = replayNetwork({ nodes: [{ id: '__proto__' }, { id: 'constructor' }], edges: [{ id: 'toString', from: '__proto__', to: 'constructor' }], steps: [step([op('Label', { target: '__proto__', text: 'Safe' })])] });
    expect(result.snapshots[0].nodes[0].label).toBe('Safe');
  });

  it('enforces node, edge, operation and text limits', () => {
    expect(() => replayNetwork({ nodes: Array.from({ length: 129 }, (_, i) => ({ id: `n${i}` })), edges: [], steps: [step([])] })).toThrow('128');
    expect(() => replayNetwork({ nodes, edges: Array.from({ length: 513 }, (_, i) => ({ id: `e${i}`, from: 'A', to: 'B' })), steps: [step([])] })).toThrow('512');
    expect(() => replay([Array.from({ length: 4097 }, () => op('Tag', { targets: 'A' }))])).toThrow('4096');
    expect(() => replay([[op('Label', { target: 'A', text: 'x'.repeat(2001) })]])).toThrow('2000');
  });

  it('uses an ordered tree layout only for a connected, single-rooted tree', () => {
    const tree = replayNetwork({ nodes: [{ id: 'root' }, { id: 'right', hidden: true }, { id: 'left' }], edges: [{ id: 'leftEdge', from: 'root', to: 'left' }, { id: 'rightEdge', from: 'root', to: 'right' }], steps: [step([])] });
    const layout = layoutNetwork(tree);
    expect(layout.kind).toBe('tree');
    expect(layout.nodes.get('left')!.x).toBeLessThan(layout.nodes.get('right')!.x);
    expect(layout.nodes.get('root')!.y).toBeLessThan(layout.nodes.get('left')!.y);
    for (const graph of [
      { nodes: [{ id: 'A' }, { id: 'B' }], edges: [] },
      { nodes: [{ id: 'A' }, { id: 'B' }], edges: edges.slice(0, 2) },
      { nodes: [{ id: 'A' }], edges: [edges[3]] },
      { nodes: [{ id: 'A' }, { id: 'B' }], edges: [edges[0], edges[2]] },
      { nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }], edges: [edges[0], { id: 'cb', from: 'C', to: 'B' }] },
    ]) expect(layoutNetwork(replayNetwork({ ...graph, steps: [step([])] })).kind).toBe('graph');
  });

  it('reserves hidden nodes and future labels, and produces distinct bounded lanes and loops deterministically', () => {
    const result = replay([[], [op('Show', { ids: 'C' }), op('Label', { target: 'A', text: 'Long label '.repeat(50) })]]);
    const layout = layoutNetwork(result);
    expect(layoutNetwork(result)).toEqual(layout);
    expect(layout.nodes.size).toBe(3);
    expect(new Set(layout.edges.map(e => e.path)).size).toBe(edges.length);
    expect(new Set(layout.edges.slice(0, 3).map(e => JSON.stringify(e.label))).size).toBe(3);
    expect(layout.edges.find(e => e.id === 'loop')!.path).toContain(' C');
    for (const box of [...layout.nodes.values(), ...layout.edges.map(e => e.label)]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(layout.width);
      expect(box.y + box.height).toBeLessThanOrEqual(layout.height);
    }
    expect(layout.nodes.get('A')!.height).toBeGreaterThan(100);
  });

  it('fits short labels and keeps a small graph within a chat pane', () => {
    const layout = layoutNetwork(replayNetwork({ nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D', hidden: true }], edges: [{ id: 'ab', from: 'A', to: 'B', label: '4' }, { id: 'ac', from: 'A', to: 'C', label: '1' }, { id: 'cb', from: 'C', to: 'B', label: '2' }, { id: 'bd', from: 'B', to: 'D', label: '5' }], steps: [step([])] }));
    expect(layout.nodes.get('A')!.width).toBeLessThan(100);
    expect(Math.max(layout.width, layout.height)).toBeLessThan(500);
  });

  it('matches independent array state through seeded operation programs', () => {
    for (let seed = 1; seed <= 64; seed++) {
      let random = seed;
      const state = nodes.map(n => ({ id: n.id, label: n.id, hidden: n.id === 'C', tag: 'plain' }));
      const changes: unknown[][] = [];
      const expected = [];
      for (let k = 0; k < 64; k++) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const index = random % 3;
        const kind = (random >>> 8) % 4;
        const n = state[index];
        if (kind === 0) { n.hidden = true; changes.push([op('Hide', { ids: n.id })]); }
        else if (kind === 1) { n.hidden = false; changes.push([op('Show', { ids: n.id })]); }
        else if (kind === 2) { n.label = `Label ${k}`; changes.push([op('Label', { target: n.id, text: n.label })]); }
        else { n.tag = k % 2 ? 'active' : 'plain'; changes.push([op('Tag', { targets: n.id, ...(n.tag === 'plain' ? {} : { tag: n.tag }) })]); }
        expected.push(state.map(v => ({ ...v })));
      }
      const result = replay(changes);
      expect(result.snapshots.map(s => s.nodes)).toEqual(expected);
      expect(replay(changes)).toEqual(result);
    }
  });
});
