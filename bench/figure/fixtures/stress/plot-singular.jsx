export default function () {
  return (
    <Plot id="p" x={[-4, 4]} y={[-10, 10]} xLabel="x" yLabel="y">
      <Fn id="tan" f={x => Math.tan(x)} label="tan x" />
      <Fn id="inv" f={x => 1 / x} label="1/x" tag="new" />
      <Fn id="log" f={x => Math.log(x)} from={0.001} to={4} label="ln x" tag="good" />
      <Fn id="exp" f={x => Math.exp(3 * x)} label="e^{3x}" tag="bad" />
    </Plot>
  );
}
