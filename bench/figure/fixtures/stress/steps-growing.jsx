export default function () {
  const steps = Array.from({ length: 12 }, (_, i) => ({ n: i + 1 }));
  return <Figure steps={steps} caption={step => 'Step ' + step.n + ' adds a line of text.'} render={step => (
    <Column>
      <Text>{Array.from({ length: step.n }, (_, i) => 'Line ' + (i + 1) + ' of a growing explanation that wraps on a narrow pane.').join('\n\n')}</Text>
      <Seq id="s" items={Array.from({ length: step.n }, (_, i) => ({ id: 'c' + i, label: i * i }))} tags={{ ['c' + (step.n - 1)]: 'new' }} />
    </Column>
  )} />;
}
