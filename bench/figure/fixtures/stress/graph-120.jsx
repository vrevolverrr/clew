export default function () {
  const nodes = [];
  const edges = [];
  for (let i = 0; i < 120; i++) {
    nodes.push({ id: 'v' + i, label: String(i) });
    if (i > 0) edges.push({ id: 't' + i, from: 'v' + Math.floor((i - 1) / 3), to: 'v' + i });
  }
  for (let i = 0; i < 30; i++) edges.push({ id: 'x' + i, from: 'v' + (i * 7 % 120), to: 'v' + ((i * 13 + 5) % 120) });
  return <Graph id="g" nodes={nodes} edges={edges} />;
}
