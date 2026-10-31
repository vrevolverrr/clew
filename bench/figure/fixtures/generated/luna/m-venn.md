Shade the part **inside A but outside B**.

```figure
const left = [-0.8, 0];
const right = [0.8, 0];
const r = 1.2;
const h = Math.sqrt(r * r - 0.8 * 0.8);
const alpha = Math.acos(0.8 / r);
const lowerB = Math.atan2(-h, -0.8);
const pts = [];

for (let i = 0; i <= 40; i++) {
  const t = alpha + (2 * Math.PI - 2 * alpha) * i / 40;
  pts.push([left[0] + r * Math.cos(t), r * Math.sin(t)]);
}
for (let i = 0; i <= 20; i++) {
  const t = lowerB - (Math.PI - 2 * alpha) * i / 20;
  pts.push([right[0] + r * Math.cos(t), r * Math.sin(t)]);
}

export default function () {
  return (
    <Diagram id="venn" width={5} height={3}>
      <Shape id="shade" pts={pts} closed tag="good" />
      <Circle id="circleA" at={left} r={r} />
      <Circle id="circleB" at={right} r={r} />
      <Label at={[-1.35, 0.95]} text="A" />
      <Label at={[1.15, 0.95]} text="B" />
    </Diagram>
  );
}
```

The shaded crescent is $A \cap B^{c}$: elements that belong to $A$ and do not belong to $B$.

