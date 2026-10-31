export default function () {
  const f = (x, y) => Math.exp(-(x * x + y * y));
  return (
    <Plot id="p" x={[-2, 2]} y={[-2, 2]} xLabel="$\theta_1$ (rad)" yLabel="$\theta_2$ (rad)" zLabel="$L(\theta) = e^{-\|\theta\|^2}$">
      <Fn id="s" f={f} label="$e^{-(x^2 + y^2)}$" />
      <Points id="top" pts={[[0, 0, 1]]} label="$\nabla L = 0$" tag="good" />
      <Vector id="g" from={[1, 1, f(1, 1)]} to={[0.5, 0.5, f(0.5, 0.5)]} label="$-\eta \nabla L$" tag="active" />
      <Label at={[-1.5, 1.5, 0.8]} text="$\displaystyle\int\!\!\int L\,d\theta = \pi$" />
    </Plot>
  );
}
