I’ll show the line, the ε-wide target band around \(f(1)=3\), and the corresponding δ-wide interval around \(x=1\).

For every tolerance \(\varepsilon>0\), we need a distance \(\delta>0\) so that if \(x\) is within \(\delta\) of 1, then \(f(x)\) is within \(\varepsilon\) of \(f(1)=3\):

$$
0<|x-1|<\delta
\quad\Longrightarrow\quad
|f(x)-3|<\varepsilon
$$

Here, \(f(x)=2x+1\), so the output changes twice as fast as the input. Choosing \(\delta=\varepsilon/2\) makes the output stay within \(\varepsilon\). For example, when \(\varepsilon=0.8\), choose \(\delta=0.4\). The shaded bands show these bounds; their edges are excluded by the strict inequalities.

```figure
export const params = {
  epsilon: { label: 'ε', min: 0.2, max: 2, step: 0.2, value: 0.8 }
};

export default function ({ epsilon }) {
  const delta = epsilon / 2;
  return (
    <Figure
      steps={[{ epsilon, delta }]}
      caption={step => `For ε = ${step.epsilon}, choose δ = ε/2 = ${step.delta}.`}
      render={step => (
        <Plot id="limit" x={[0, 2]} y={[-1, 5]} xLabel="x" yLabel="f(x)">
          <Region top={3 + step.epsilon} base={3 - step.epsilon} from={0} to={2} label="ε band" />
          <Fn id="line" f={x => 2 * x + 1} from={0} to={2} label="f(x) = 2x + 1" />
          <Shape id="delta-left" pts={[[1 - step.delta, -1], [1 - step.delta, 5]]} label="1 − δ" />
          <Shape id="delta-right" pts={[[1 + step.delta, -1], [1 + step.delta, 5]]} label="1 + δ" />
          <Points pts={[[1, 3]]} label="(1, 3)" />
        </Plot>
      )}
    />
  );
}
```

