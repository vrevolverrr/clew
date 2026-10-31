```figure
export const params = { price: { label: 'Price per unit', min: 31, max: 100, step: 1, value: 50, unit: '$' } };

const FIXED = 12000;   // fixed costs, dollars
const VAR = 30;        // variable cost per unit, dollars

export default function ({ price }) {
  const q = price > VAR ? FIXED / (price - VAR) : null;   // exact break-even units
  const xMax = q === null ? 1000 : Math.max(1000, Math.ceil(q * 1.3));
  const yMax = Math.max(price * xMax, FIXED + VAR * xMax) * 1.1;
  const units = q === null ? null : Math.ceil(q);
  return (
    <Column gap="md">
      <Plot id="chart" x={[0, xMax]} y={[0, yMax]} xLabel="Units sold" yLabel="Dollars">
        <Fn id="rev" f={x => price * x} from={0} to={xMax} label="Revenue" />
        <Fn id="cost" f={x => FIXED + VAR * x} from={0} to={xMax} label="Total cost" />
        {q !== null && <Points pts={[[q, price * q]]} label="Break-even" />}
      </Plot>
      {q === null ? (
        <Text>The price must be above 30, the variable cost. At or below it, the lines never cross.</Text>
      ) : (
        <Column gap="md">
          <Tex tex={`q^* = \\frac{${FIXED}}{${price} - ${VAR}} \\approx ${q.toFixed(1)}`} />
          <Row gap="lg">
            <Node id="units" label={`${units}`} sub="units to break even" />
            <Node id="rev-be" label={`${units * price}`} sub="revenue at break-even" />
          </Row>
        </Column>
      )}
    </Column>
  );
}
```

Not run: I checked the program by reading it, not by rendering it.