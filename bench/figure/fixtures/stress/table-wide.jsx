export default function () {
  const columns = ['Month', ...Array.from({ length: 15 }, (_, i) => 'Account ' + (i + 1) + ' balance (USD)')];
  const rows = Array.from({ length: 30 }, (_, r) => ['2026-' + String(r % 12 + 1).padStart(2, '0'), ...Array.from({ length: 15 }, (_, c) => '$' + ((r + 1) * (c + 3) * 1234.5).toFixed(2))]);
  const rowIds = rows.map((_, r) => 'r' + r);
  return <Table id="t" title="Monthly balances" columns={columns} rows={rows} rowIds={rowIds} tags={{ r3: 'active', 'r7.4': 'bad' }} />;
}
