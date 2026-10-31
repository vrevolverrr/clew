export default function () {
  return (
    <Column gap="md">
      <Row gap="sm">
        <Node id="zh" label="二叉搜索树" sub="中文标签" />
        <Node id="ar" label="شجرة البحث الثنائية" sub="تسمية عربية" />
        <Node id="ja" label="二分探索木" sub="日本語のラベル" />
        <Node id="emoji" label="📈 growth" sub="emoji and text" />
      </Row>
      <Table id="t" columns={['English', '中文', 'العربية']} rows={[['tree', '树', 'شجرة'], ['node', '节点', 'عقدة']]} rowIds={['a', 'b']} />
    </Column>
  );
}
