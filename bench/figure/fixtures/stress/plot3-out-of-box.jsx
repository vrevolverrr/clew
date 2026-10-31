export default function () {
  return (
    <Plot id="p" x={[-1, 1]} y={[-1, 1]} z={[0, 1]}>
      <Fn id="wide" f={(x, y) => 0.5 + 0.1 * x} from={-10} to={10} />
      <Points id="far" pts={[[0, 0, 50]]} label="far above the box" tag="bad" />
      <Shape id="mast" pts={[[0, 0, 0], [0, 0, 50]]} tag="active" />
      <Vector id="out" from={[0, 0, 0.5]} to={[3, 3, 3]} label="leaves the box" />
      <Label at={[5, 5, 5]} text="label outside" />
    </Plot>
  );
}
