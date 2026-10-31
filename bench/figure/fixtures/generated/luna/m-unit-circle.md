On the unit circle, the point at angle $\theta$ has coordinates $(\cos\theta,\sin\theta)$. The horizontal segment shows $\cos\theta$; the vertical segment shows $\sin\theta$. Drag the slider to change $\theta$.

```figure
export const params = {
  theta: { label: 'Angle θ', min: 0, max: 360, step: 1, value: 45, unit: '°' }
};

export default function ({ theta }) {
  const c = [2.4, 2.4];
  const r = 1.55;
  const rad = theta * Math.PI / 180;
  const p = [c[0] + r * Math.cos(rad), c[1] + r * Math.sin(rad)];
  const foot = [p[0], c[1]];
  const circle = Array.from({ length: 65 }, (_, i) => {
    const a = 2 * Math.PI * i / 64;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  });
  const arc = Array.from({ length: Math.max(2, Math.ceil(theta / 5) + 1) }, (_, i, arr) => {
    const a = rad * i / (arr.length - 1);
    return [c[0] + 0.48 * Math.cos(a), c[1] + 0.48 * Math.sin(a)];
  });

  return (
    <Diagram id="unit-circle" width={4.8} height={4.8}>
      <Segment from={[0.35, c[1]]} to={[4.45, c[1]]} />
      <Segment from={[c[0], 0.35]} to={[c[0], 4.45]} />
      <Shape id="circle" pts={circle} closed label="Unit circle" />
      <Shape id="theta-arc" pts={arc} />
      <Segment id="cos-length" from={c} to={foot} />
      <Segment id="sin-length" from={foot} to={p} />
      <Vector from={c} to={p} label="radius = 1" />
      <Circle id="point" at={p} r={0.07} />
      <Label at={[4.35, c[1] - 0.15]} text="x" />
      <Label at={[c[0] + 0.12, 4.35]} text="y" />
      <Label at={[c[0] + 0.65 * Math.cos(rad / 2), c[1] + 0.65 * Math.sin(rad / 2)]} text={`$\\theta = ${theta}^\\circ$`} />
      <Label at={[(c[0] + foot[0]) / 2, c[1] - 0.2]} text="$\\cos\\theta$" />
      <Label at={[foot[0] + 0.2, (foot[1] + p[1]) / 2]} text="$\\sin\\theta$" />
    </Diagram>
  );
}
```

