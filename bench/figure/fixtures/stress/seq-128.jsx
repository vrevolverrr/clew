export default function () {
  const items = Array.from({ length: 128 }, (_, i) => ({ id: 'i' + i, label: (i * 37) % 101 }));
  return (
    <Column>
      <Seq id="s" title="128 values" index items={items} tags={{ i0: 'active', i64: 'match', i127: 'done' }} />
      <Pointer to="i0" name="lo" />
      <Pointer to="i64" name="mid" />
      <Pointer to="i127" name="hi" />
    </Column>
  );
}
