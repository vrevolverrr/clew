Break-even is where revenue equals total cost. At price $60 per unit, the chart shows the point where the two lines meet. Use the price slider to see how it moves.

```figure
export const params = {
  price: { label: 'Price per unit', min: 35, max: 150, step: 5, value: 60, unit: '$' }
};

export default function ({ price }) {
  const breakEvenUnits = 12000 / (price - 30);
  const xHi = Math.ceil((breakEvenUnits * 1.2) / 100) * 100;

  return (
    <Plot id="break-even-chart" x={[0, xHi]} xLabel="Units sold" yLabel="Dollars">
      <Fn id="revenue" f={units => price * units} from={0} to={xHi} label="Revenue" />
      <Fn id="total-cost" f={units => 12000 + 30 * units} from={0} to={xHi} label="Total cost" />
      <Circle at={[breakEvenUnits, price * breakEvenUnits]} r={5} label="Break-even" tag="match" />
    </Plot>
  );
}
```

