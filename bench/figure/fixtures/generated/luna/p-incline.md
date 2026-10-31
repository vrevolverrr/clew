The diagram shows the block’s weight, the incline’s normal force, and friction pointing up the slope, assuming gravity tends to make the block slide down. Change the angle with the slider.

```figure
export const params = {
  angle: { label: 'Incline angle', min: 10, max: 55, step: 1, value: 30, unit: '°' }
};

export default function ({ angle }) {
  const a = angle * Math.PI / 180;
  const u = [Math.cos(a), Math.sin(a)];
  const n = [-Math.sin(a), Math.cos(a)];
  const base = [1, 1];
  const end = [base[0] + 10 * u[0], base[1] + 10 * u[1]];
  const contact = [base[0] + 5.3 * u[0], base[1] + 5.3 * u[1]];
  const add = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s];
  const center = add(contact, n, 0.7);
  const block = [
    add(add(contact, u, -1.1), n, 0),
    add(add(contact, u, 1.1), n, 0),
    add(add(add(contact, u, 1.1), n, 1.4), [0, 0], 0),
    add(add(contact, u, -1.1), n, 1.4)
  ];
  const angleRay = [3, 1 + 2 * Math.tan(a)];

  return (
    <Diagram id="incline" width={12} height={11}>
      <Shape id="slope" pts={[base, end]} label="Incline" />
      <Shape id="block" pts={block} closed label="Block" />
      <Vector from={center} to={[center[0], center[1] - 2.3]} label="$mg$" />
      <Vector from={contact} to={add(contact, n, 2.1)} label="$N$" />
      <Vector from={contact} to={add(contact, u, 2.2)} label="$f$" />
      <Angle at={base} from={[3, 1]} to={angleRay} label={`$${angle}°$`} />
    </Diagram>
  );
}
```

