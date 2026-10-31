export default function () {
  const R = 2, r = 0.6;
  return (
    <Plot id="p" view={{ azimuth: 40, elevation: -35 }} xLabel="x" yLabel="y" zLabel="z">
      <Fn id="torus" u={[0, 2 * Math.PI]} v={[0, 2 * Math.PI]} f={(u, v) => [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)]} />
      <Circle id="core" at={[0, 0, 0]} r={R} tag="new" label="core circle" />
    </Plot>
  );
}
