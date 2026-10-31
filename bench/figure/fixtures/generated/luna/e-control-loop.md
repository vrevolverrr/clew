A PID loop compares the setpoint with the measured output. The controller uses the error to drive the plant, while the sensor feeds the output back to the summing point.

```figure
export default function () {
  return (
    <Diagram id="pid-loop" width={12} height={7}>
      <Label at={[0.25, 4.35]} text="Setpoint r(t)" />
      <Vector from={[1.45, 4]} to={[1.72, 4]} />
      <Circle id="sum" at={[2, 4]} r={0.28} label="Σ" />
      <Label at={[1.85, 4.45]} text="+" />
      <Label at={[1.85, 3.45]} text="−" />

      <Vector from={[2.28, 4]} to={[3, 4]} label="Error e(t)" />
      <Shape id="pid" pts={[[3, 3.4], [5, 3.4], [5, 4.6], [3, 4.6]]} closed label="PID controller" />
      <Vector from={[5, 4]} to={[6.5, 4]} label="Control u(t)" />
      <Shape id="plant" pts={[[6.5, 3.4], [8.8, 3.4], [8.8, 4.6], [6.5, 4.6]]} closed label="Plant" />
      <Vector from={[8.8, 4]} to={[10, 4]} label="Output y(t)" />
      <Label at={[10.15, 4.35]} text="Output" />

      <Vector from={[9.4, 4]} to={[9.4, 1.2]} />
      <Vector from={[9.4, 1.2]} to={[8, 1.2]} />
      <Shape id="sensor" pts={[[6.5, 0.65], [8, 0.65], [8, 1.75], [6.5, 1.75]]} closed label="Sensor" />
      <Vector from={[6.5, 1.2]} to={[2, 1.2]} label="Measured output yₘ(t)" />
      <Vector from={[2, 1.2]} to={[2, 3.72]} />
    </Diagram>
  );
}
```

