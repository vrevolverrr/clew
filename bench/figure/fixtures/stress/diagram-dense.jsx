export default function () {
  const pts = Array.from({ length: 24 }, (_, i) => [5 + 3 * Math.cos(i / 24 * 2 * Math.PI), 5 + 3 * Math.sin(i / 24 * 2 * Math.PI)]);
  return (
    <Diagram id="d" width={10} height={10}>
      <Circle at={[5, 5]} r={3} label="circle of radius 3" />
      {pts.map((p, i) => <Points pts={[p]} label={'P' + i} />)}
      <Segment from={[5, 5]} to={pts[0]} label="r" />
      <Angle at={[5, 5]} from={pts[0]} to={pts[3]} label="45°" />
      <Dimension from={[2, 1]} to={[8, 1]} label="6 units" />
      <Label at={[5, 5]} text="centre" />
    </Diagram>
  );
}
