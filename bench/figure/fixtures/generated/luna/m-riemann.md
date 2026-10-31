A left Riemann sum estimates area by using the function value at the **left edge** of each rectangle for its height. Change the number of rectangles below to see how the estimate changes.

$$L_n=\sum_{i=0}^{n-1} f\!\left(\frac{2i}{n}\right)\frac{2}{n}$$

Here the width is $2/n$, and each height is $f(2i/n)=(2i/n)^2$.

```figure
export const params = {
  n: { label: 'Rectangles', min: 1, max: 8, step: 1, value: 4 }
};

export default function ({ n }) {
  const width = 2 / n;
  const sum = Array.from({ length: n }, (_, i) => (i * width) ** 2 * width)
    .reduce((total, area) => total + area, 0);

  return (
    <Column gap="md">
      <Plot id="left-sum" x={[0, 2]} y={[0, 4.3]} xLabel="x" yLabel="f(x)">
        <Fn id="curve" f={x => x * x} from={0} to={2} label="$f(x)=x^2$" />
        {Array.from({ length: n }, (_, i) => {
          const from = i * width;
          return (
            <Region
              id={`rect-${i}`}
              top={from * from}
              from={from}
              to={from + width}
            />
          );
        })}
      </Plot>
      <Text>{`Width $\\Delta x = ${width.toFixed(3)}$; left sum $L_${n} \\approx ${sum.toFixed(3)}$.`}</Text>
    </Column>
  );
}
```

