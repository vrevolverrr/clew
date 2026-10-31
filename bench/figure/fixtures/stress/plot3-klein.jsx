export default function () {
  const r = 2;
  return (
    <Plot id="p" xLabel="x" yLabel="y" zLabel="z">
      <Fn id="klein" u={[0, 2 * Math.PI]} v={[0, 2 * Math.PI]} f={(u, v) => {
        const w = r + Math.cos(u / 2) * Math.sin(v) - Math.sin(u / 2) * Math.sin(2 * v);
        return [w * Math.cos(u), w * Math.sin(u), Math.sin(u / 2) * Math.sin(v) + Math.cos(u / 2) * Math.sin(2 * v)];
      }} />
    </Plot>
  );
}
