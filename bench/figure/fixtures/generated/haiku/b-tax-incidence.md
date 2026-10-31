A 20 per-unit tax cuts the traded quantity from 40 to 30 and creates a deadweight loss of 100.

A per-unit tax is a fixed amount that sellers pay to the government for each unit sold. Sellers need more per unit to supply the same quantity, so the supply curve shifts up by the tax. Fewer units trade, and some trades that buyers valued above their cost to sellers no longer happen. The value lost on those trades is the deadweight loss.

With $P_b$ the price buyers pay and $P_s$ the price sellers keep, the tax $t$ creates a wedge between them:

$$P_b - P_s = t$$

The deadweight loss is the triangle of lost trades between the demand and supply curves:

$$DWL = \tfrac{1}{2}\, t\, \Delta Q$$

Here $\Delta Q$ is the fall in quantity traded.

```figure
export default function () {
  const steps = [
    { tax: false, dwl: false, text: 'Before the tax: demand meets supply at $Q = 40$, $P = 60$.' },
    { tax: true, dwl: false, text: 'The tax lifts the supply price by $20$. Buyers pay $70$, sellers keep $50$, and $Q$ falls to $30$.' },
    { tax: true, dwl: true, text: 'The lost trades between $Q = 30$ and $Q = 40$ form the deadweight loss, area $100$.' },
  ];
  return (
    <Figure steps={steps} caption={step => step.text} render={step => (
      <Plot id="plot" x={[0, 100]} y={[0, 100]} xLabel="Q" yLabel="P">
        <Fn id="dem" f={q => 100 - q} from={0} to={100} label="Demand" />
        <Fn id="sup" f={q => 20 + q} from={0} to={80} label="Supply" />
        {step.tax ? <Fn id="taxSup" f={q => 40 + q} from={0} to={60} label="Supply + tax" /> : null}
        {step.tax ? <Segment from={[30, 50]} to={[30, 70]} label="tax 20" /> : null}
        {step.dwl ? <Region top="dem" base="sup" from={30} to={40} label="DWL" /> : null}
        <Points pts={step.tax ? [[30, 50], [30, 70]] : [[40, 60]]} />
      </Plot>
    )} />
  );
}
```

Worked example:

1. Before the tax, demand meets supply: $100 - Q = 20 + Q$, so $Q = 40$ and $P = 60$.
2. The tax adds 20 to the price sellers need. The new supply curve in buyer terms is $P_b = 40 + Q$. Set it equal to demand: $100 - Q = 40 + Q$, so $Q = 30$.
3. Buyers pay $P_b = 100 - 30 = 70$. Sellers keep $P_s = 70 - 20 = 50$. Check: supply at $Q = 30$ is $20 + 30 = 50$.
4. Tax revenue: $t \times Q = 20 \times 30 = 600$.
5. Deadweight loss: the lost trades run from $Q = 30$ to $Q = 40$, a base of 10, with height $t = 20$:

$$DWL = \tfrac{1}{2} \times 10 \times 20 = 100$$

Check with surplus. Consumer surplus falls from 800 to 450, and producer surplus falls from 800 to 450. The total loss is 700, which equals 600 revenue plus 100 deadweight loss.

The triangle shortcut holds only when both curves are straight lines. With curves, the area needs integration.