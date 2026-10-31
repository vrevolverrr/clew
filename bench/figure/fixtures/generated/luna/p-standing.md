A **standing wave** forms when waves traveling along a string reflect and combine. On a string fixed at both ends, the ends must stay still, so they are nodes. Each allowed harmonic fits a whole-number count of half-wavelengths along the string.

For a string of length $L$ with wave speed $v$, harmonic $n$ has wavelength $\lambda_n$ and frequency $f_n$:

$$
\lambda_n = \frac{2L}{n},
\qquad
f_n = \frac{nv}{2L}
$$

Here $n=1,2,3,\ldots$; $n=1$ is the fundamental, and each higher number is a harmonic. The first four patterns are shown below; each curve is a snapshot, and the marked points are nodes.

```figure
export default function () {
  const harmonics = [1, 2, 3, 4];
  return (
    <Diagram id="harmonics" width={1} height={5}>
      {harmonics.map((n, row) => {
        const y0 = 0.55 + row * 1.2;
        const wave = Array.from({ length: 81 }, (_, i) => {
          const x = i / 80;
          return [x, y0 + 0.34 * Math.sin(n * Math.PI * x)];
        });
        const nodes = Array.from({ length: n + 1 }, (_, j) => [
          j / n,
          y0
        ]);
        return (
          <>
            <Segment from={[0, y0]} to={[1, y0]} id={`base-${n}`} />
            <Shape pts={wave} id={`wave-${n}`} />
            <Points pts={nodes} id={`nodes-${n}`} />
            <Label at={[0.04, y0 + 0.46]} text={`${n === 1 ? 'Fundamental' : `Harmonic ${n}`} · ${n} half-wavelength${n > 1 ? 's' : ''}`} />
          </>
        );
      })}
    </Diagram>
  );
}
```

For example, if $L=1.2$ m and $v=240$ m/s, the fundamental is $240/(2 \cdot 1.2)=100$ Hz. The next three harmonics are $200$, $300$, and $400$ Hz. This pattern assumes the string’s tension and wave speed stay the same.

