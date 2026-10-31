export default function () {
  return (
    <Plot id="p" xLabel="x" yLabel="y" zLabel="z">
      <Fn id="disk" u={[0, 2 * Math.PI]} v={[0, 1]} f={(u, v) => [v * Math.cos(u), v * Math.sin(u), 0]} />
    </Plot>
  );
}
