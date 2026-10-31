A **standing wave** is a pattern that stays in place. The string swings up and down, but the wave does not travel along it. On a string fixed at both ends, the ends cannot move, so they must be points of zero motion, called **nodes**. The points of largest motion are **antinodes**. Only patterns that fit a whole number of half-wavelengths between the ends can form, and each one is a **harmonic**.

For a string of length $L$ with wave speed $v$, the allowed wavelengths and frequencies follow these rules:

$$\lambda_n = \frac{2L}{n}$$

$$f_n = \frac{n\,v}{2L}$$

Here $n = 1, 2, 3, \dots$ is the harmonic number, $\lambda_n$ is the wavelength of harmonic $n$, and $f_n$ is its frequency. Harmonic $n = 1$ is the **fundamental**.

```figure
const steps = [];
for (let n = 1; n <= 4; n++) {
  const nodes = [];
  for (let k = 0; k <= n; k++) nodes.push([k / n, 0]);
  const antis = [];
  for (let k = 0; k < n; k++) antis.push([(2 * k + 1) / (2 * n), k % 2 === 0 ? 1 : -1]);
  steps.push({ n, nodes, antis });
}

export default function () {
  return (
    <Figure
      steps={steps}
      heading={step => `Harmonic n = ${step.n}`}
      caption={step => `$\\lambda_n = 2L/${step.n}$: the string holds ${step.n} loop${step.n > 1 ? 's' : ''}, with nodes at both ends.`}
      render={step => (
        <Plot id="string" x={[0, 1]} y={[-1.4, 1.4]} xLabel="x / L" yLabel="displacement">
          <Fn id="shape" f={x => Math.sin(step.n * Math.PI * x)} from={0} to={1} />
          <Points pts={step.nodes} />
          <Points pts={step.antis} />
        </Plot>
      )}
    />
  );
}
```

Example: a string 0.65 m long with wave speed 130 m/s. The fundamental is

$$f_1 = \frac{1 \times 130}{2 \times 0.65} = 100\ \text{Hz}$$

The next harmonics are 200 Hz and 300 Hz. To find which harmonic gives 700 Hz, rearrange the rule: $n = 2L f_n / v = (1.30 \times 700)/130 = 7$. So 700 Hz is the seventh harmonic, with $\lambda_7 = 1.30/7 \approx 0.186$ m.

The rules assume an ideal string: small swings and uniform tension. Real stiff strings push the higher harmonics slightly sharp.