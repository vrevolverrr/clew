export default function () {
  return (
    <Row>
      <Plot id="pole" x={[-2, 2]} y={[-2, 2]} zLabel="1/(x² + y²)"><Fn id="a" f={(x, y) => 1 / (x * x + y * y)} /></Plot>
      <Plot id="tan" x={[-3, 3]} y={[-1, 1]} zLabel="y tan x"><Fn id="b" f={(x, y) => Math.tan(x) * y} /></Plot>
    </Row>
  );
}
