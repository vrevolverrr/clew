The limit of $f(x)=2x+1$ at $x=1$ is $3$. The epsilon-delta definition says that $f(x)$ can be kept within any distance $\varepsilon$ of $3$ if $x$ stays within some distance $\delta$ of $1$. The slider sets $\varepsilon$, the output tolerance. For each $\varepsilon$, you must find a $\delta$ that works.

For every $\varepsilon>0$ there is a $\delta>0$ such that

$$0<|x-1|<\delta \implies |f(x)-3|<\varepsilon$$

The condition $0<|x-1|$ excludes $x=1$ itself.

To find $\delta$, simplify the output distance first: $|f(x)-3|=|2x-2|=2|x-1|$. Requiring $2|x-1|<\varepsilon$ gives $|x-1|<\varepsilon/2$, so $\delta=\varepsilon/2$ works. For $\varepsilon=0.5$, $\delta=0.25$: every $x$ in $(0.75,\,1.25)$ gives $f(x)$ in $(2.5,\,3.5)$, and $|f(x)-3|<0.5$.

```figure
export const params = { eps: { label: 'ε', min: 0.1, max: 2, step: 0.05, value: 0.5 } };

export default function ({ eps }) {
  const d = eps / 2;                       // delta = eps / 2, since |f(x) - 3| = 2|x - 1|
  const lo = 3 - eps, hi = 3 + eps;
  const xl = 1 - d, xr = 1 + d;
  return (
    <Column gap="md">
      <Plot id="plot" x={[0, 2]} y={[0, 6]} xLabel="x" yLabel="y">
        <Fn id="f" f={x => 2 * x + 1} from={0} to={2} label="f(x) = 2x + 1" />
        <Region id="box" top={hi} base={lo} from={xl} to={xr} tag="active" />
        <Segment id="band-lo" from={[0, lo]} to={[2, lo]} />
        <Segment id="band-hi" from={[0, hi]} to={[2, hi]} />
        <Segment id="left" from={[xl, 0]} to={[xl, 6]} />
        <Segment id="right" from={[xr, 0]} to={[xr, 6]} />
        <Label at={[0.05, hi + 0.2]} text={`$3+\\varepsilon$`} />
        <Label at={[0.05, lo - 0.35]} text={`$3-\\varepsilon$`} />
        <Label at={[xl, 0.3]} text={`$1-\\delta$`} />
        <Label at={[xr, 0.3]} text={`$1+\\delta$`} />
        <Points pts={[[1, 3]]} label="limit at x = 1" />
      </Plot>
      <Text>{`$\\delta = \\varepsilon / 2 = ${+d.toPrecision(4)}$`}</Text>
    </Column>
  );
}
```

Drag $\varepsilon$ down and the shaded box shrinks, but the line still crosses it corner to corner, so $\delta=\varepsilon/2$ always works.

Not checked: I did not render the figure, so the slider and the shaded box are untested in the pane.