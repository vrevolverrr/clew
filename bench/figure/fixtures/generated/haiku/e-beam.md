Shear force $V(x)$ is the internal vertical force at a cut. Bending moment $M(x)$ is the internal turning effect at that cut. Both come from the support reactions and the loads on one side of the cut.

For a load $P$ at distance $a$ from support A, on a span $L$, equilibrium gives the reactions:

$$R_A = \frac{P(L-a)}{L}$$

$$R_B = \frac{Pa}{L}$$

With upward left-side shear taken as positive, the shear is

$$V(x) = \begin{cases} R_A & 0 < x < a \\ -R_B & a < x < L \end{cases}$$

and the moment is

$$M(x) = \begin{cases} R_A\,x & 0 \le x \le a \\ R_B\,(L-x) & a \le x \le L \end{cases}$$

Shear jumps by $P$ at the load. The moment peaks under the load, where the shear changes sign.

Worked example, with $a = 2$ m, $L = 6$ m, $P = 12$ kN:

1. $R_A = 12(4)/6 = 8$ kN and $R_B = 12(2)/6 = 4$ kN. Check: $8 + 4 = 12$ kN.
2. Shear is $+8$ kN from 0 to 2 m, then $-4$ kN from 2 to 6 m. The 12 kN drop is the load.
3. Moment rises to $8 \times 2 = 16$ kN m at 2 m, then falls to 0 at 6 m. From the right, $4 \times 4 = 16$ kN m agrees.

Drag the slider to move the load:

```figure
export const params = {
  a: { label: 'Load position a', min: 0, max: 6, step: 0.1, value: 2, unit: 'm' }
};

const L = 6;   // span, m
const P = 12;  // load, kN

export default function ({ a }) {
  const RA = P * (L - a) / L;
  const RB = P * a / L;
  const Mmax = P * a * (L - a) / L;
  const v = [[0, RA], [a, RA], [a, -RB], [L, -RB]];
  const m = [[0, 0], [a, Mmax], [L, 0]];
  return (
    <Column gap="md">
      <Diagram id="beam" width={7} height={3}>
        <Segment id="span" from={[0.5, 1.5]} to={[6.5, 1.5]} />
        <Vector id="load" from={[a + 0.5, 3]} to={[a + 0.5, 1.5]} label="$P = 12$ kN" />
        <Vector id="ra" from={[0.5, 0.2]} to={[0.5, 1.5]} label={`$R_A = ${RA.toFixed(2)}$ kN`} />
        <Vector id="rb" from={[6.5, 0.2]} to={[6.5, 1.5]} label={`$R_B = ${RB.toFixed(2)}$ kN`} />
      </Diagram>
      <Plot id="shear" x={[0, L]} y={[-12, 12]} xLabel="x (m)" yLabel="V (kN)">
        <Shape id="v" pts={v} />
      </Plot>
      <Plot id="moment" x={[0, L]} y={[0, 20]} xLabel="x (m)" yLabel="M (kN m)">
        <Shape id="mom" pts={m} />
      </Plot>
    </Column>
  );
}
```

Moving the load to midspan ($a = 3$ m) gives the largest moment, $M_{max} = PL/4 = 18$ kN m.

Not checked: I did not render the figure, so the layout and label placement are untested. The moment is plotted upward, so sagging appears as a positive value.