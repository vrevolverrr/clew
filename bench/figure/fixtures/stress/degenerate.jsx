export default function () {
  return (
    <Column>
      <Graph id="g" nodes={[{ id: 'only', label: 'alone' }]} edges={[]} />
      <Seq id="s" items={[]} title="empty array" />
      <Table id="t" columns={['a']} rows={[]} rowIds={[]} />
      <Plot id="p" x={[0, 1]} y={[0, 1]} />
    </Column>
  );
}
