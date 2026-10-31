```figure
export const params = { n: { label: 'Rectangles', min: 1, max: 32, step: 1, value: 4 } };

export default function ({ n }) {
  const a = 0, b = 2;
  const dx = (b - a) / n;
  const f = x => x * x;
  const idx = Array.from({ length: n }, (_, i) => i);
  const sum = idx.reduce((s, i) => s + f(a + i * dx) * dx, 0);
  return (
    <Column gap="md">
      <Plot id="plot" x={[0, 2]} y={[0, 4.5]} xLabel="x" yLabel="y">
        <Fn id="f" f={x => x * x} from={0} to={2} label="$x^2$" />
        {idx.map(i => (
          <Region id={`r${i}`} top={f(a + i * dx)} from={a + i * dx} to={a + (i + 1) * dx} />
        ))}
      </Plot>
      <Tex tex="L_n = \sum_{i=0}^{n-1} f(x_i)\,\Delta x" />
      <Text>{`With $n = ${n}$$ rectangles, $\\Delta x = ${dx.toFixed(4)}$. Then $L_n = ${sum.toFixed(4)}$, against the exact area $8/3 \\approx 2.6667$.`}</Text>
    </Column>
  );
}
```

Drag the **Rectangles** slider to change `n`. Each rectangle takes the height of $x^2$ at its left edge.