import { layoutNetwork } from '@/renderer/figure/network/layoutNetwork';

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** A label's text with its own 4 px of background: its box less the padding the layout sizes it with. */
const ink = (box: Box): Box => ({ x: box.x + 8, y: box.y + 6, width: box.width - 16, height: box.height - 12 });
const centre = (box: Box): [number, number] => [box.x + box.width / 2, box.y + box.height / 2];

describe('layoutNetwork', () => {
  it('keeps edge labels off each other and off the nodes in a chain with every transition and self-loop', () => {
    const ids = ['sunny', 'cloudy', 'rainy'];
    const edges = ids.flatMap((from) => ids.map((to) => ({ id: `${from}-${to}`, from, to })));
    const layout = layoutNetwork({ nodes: ids.map((id) => ({ id })), edges, nodeLabels: ids, edgeLabels: ['0.6', '0.3', '0.1', '0.4', '0.2'] });
    const labels = layout.edges.map((edge) => ink(edge.label));
    labels.forEach((label, i) => {
      labels.slice(i + 1).forEach((other) => expect(overlap(label, other)).toBe(false));
      for (const node of layout.nodes.values()) expect(overlap(label, node)).toBe(false);
    });
  });

  it('draws a self-loop on the side away from the node\'s neighbour', () => {
    const layout = layoutNetwork({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'loop', from: 'b', to: 'b' }],
      nodeLabels: ['a', 'b'],
      edgeLabels: ['x'],
    });
    const [ax, ay] = centre(layout.nodes.get('a')!);
    const [bx, by] = centre(layout.nodes.get('b')!);
    const [lx, ly] = centre(layout.edges.find((edge) => edge.id === 'loop')!.label);
    expect((ax - bx) * (lx - bx) + (ay - by) * (ly - by)).toBeLessThan(0);
  });
});
