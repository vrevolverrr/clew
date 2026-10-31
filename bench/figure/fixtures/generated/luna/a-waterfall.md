Operating cash flow is **$110k**: start with $80k net income, add $30k depreciation, subtract the $25k increase in receivables, then add $10k from lower inventory and $15k from higher payables.

```figure
export default function () {
  return (
    <Plot id="cash-flow" x={[-0.5, 6.5]} y={[-15, 130]} xLabel="" yLabel="$k">
      <Region top={80} base={0} from={0.2} to={0.8} label="$80" tag="active" />
      <Region top={110} base={80} from={1.2} to={1.8} label="+$30" tag="good" />
      <Region top={110} base={85} from={2.2} to={2.8} label="−$25" tag="bad" />
      <Region top={95} base={85} from={3.2} to={3.8} label="+$10" tag="good" />
      <Region top={110} base={95} from={4.2} to={4.8} label="+$15" tag="good" />
      <Region top={110} base={0} from={5.2} to={5.8} label="$110" tag="done" />
      <Label at={[0.5, -10]} text="Net income" />
      <Label at={[1.5, -10]} text="Depreciation" />
      <Label at={[2.5, -10]} text="Receivables" />
      <Label at={[3.5, -10]} text="Inventory" />
      <Label at={[4.5, -10]} text="Payables" />
      <Label at={[5.5, -10]} text="Operating cash flow" />
    </Plot>
  );
}
```

