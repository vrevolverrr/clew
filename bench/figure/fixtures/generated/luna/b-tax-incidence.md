I’ll calculate both equilibria, then show the $20 supply shift and the lost-surplus triangle.

A per-unit tax raises the price buyers must pay at every quantity, shifting the supply curve up by $20. Before the tax, demand and supply meet at $Q=40$, $P=60$.

After the tax, buyers pay $20$ more than sellers receive. The buyer price is $P_b=40+Q$, so equilibrium satisfies $100-Q=40+Q$. This gives $Q=30$, with buyers paying $70$ and sellers receiving $50$.

The tax reduces trade from 40 units to 30. The missed trades between those quantities create deadweight loss: at 30 units, the gap between demand and supply is $20$, shrinking to zero at 40.

$$
\text{DWL}=\frac{1}{2}(40-30)(20)=100
$$

```figure
export default function () {
  return (
    <Plot id="tax-plot" x={[0, 80]} y={[0, 110]} xLabel="Quantity" yLabel="Price">
      <Fn id="demand" f={q => 100 - q} from={0} to={80} label="Demand: P = 100 − Q" />
      <Fn id="supply" f={q => 20 + q} from={0} to={80} label="Supply: P = 20 + Q" />
      <Fn id="taxed-supply" f={q => 40 + q} from={0} to={80} label="Supply with tax: P = 40 + Q" />
      <Region top="demand" base="supply" from={30} to={40} label="Deadweight loss" tag="bad" />
      <Points id="before" pts={[[40, 60]]} label="Before tax (40, 60)" tag="dim" />
      <Points id="buyer" pts={[[30, 70]]} label="Buyer pays 70" tag="active" />
      <Points id="seller" pts={[[30, 50]]} label="Seller receives 50" tag="new" />
    </Plot>
  );
}
```

