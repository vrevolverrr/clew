export default function () {
  const names = ['Customer relationship management system', 'Order intake', 'Warehouse management and fulfilment', 'Billing', 'Payment gateway (external provider)', 'Analytics data warehouse'];
  const nodes = names.map((label, i) => ({ id: 'n' + i, label, sub: i % 2 ? 'internal service with a long description' : undefined }));
  const edges = [[0, 1], [1, 2], [1, 3], [3, 4], [2, 5], [3, 5], [0, 5]].map(([a, b], i) => ({ id: 'e' + i, from: 'n' + a, to: 'n' + b, label: 'sends nightly batch export ' + i, directed: true }));
  return <Graph id="g" nodes={nodes} edges={edges} tags={{ n1: 'active', e2: 'new' }} />;
}
