Quartiles use the median of each group’s lower and upper halves. In A, 40 is plotted as an outlier; the upper whisker ends at 25.

```figure
export default function () {
  return (
    <Plot id="groups" x={[0, 4]} y={[5, 43]} xLabel="Group" yLabel="Value">
      <Label at={[1, 6]} text="A" />
      <Label at={[2, 6]} text="B" />
      <Label at={[3, 6]} text="C" />

      <Segment from={[1, 12]} to={[1, 16]} />
      <Segment from={[0.8, 12]} to={[1.2, 12]} />
      <Segment from={[1, 23.5]} to={[1, 25]} />
      <Segment from={[0.8, 25]} to={[1.2, 25]} />
      <Shape pts={[[0.75, 16], [1.25, 16], [1.25, 23.5], [0.75, 23.5]]} closed />
      <Segment from={[0.75, 19]} to={[1.25, 19]} />
      <Points pts={[[1, 40]]} label="40" />

      <Segment from={[2, 8]} to={[2, 10.5]} />
      <Segment from={[1.8, 8]} to={[2.2, 8]} />
      <Segment from={[2, 15.5]} to={[2, 18]} />
      <Segment from={[1.8, 18]} to={[2.2, 18]} />
      <Shape pts={[[1.75, 10.5], [2.25, 10.5], [2.25, 15.5], [1.75, 15.5]]} closed />
      <Segment from={[1.75, 14.5]} to={[2.25, 14.5]} />

      <Segment from={[3, 20]} to={[3, 22]} />
      <Segment from={[2.8, 20]} to={[3.2, 20]} />
      <Segment from={[3, 28]} to={[3, 31]} />
      <Segment from={[2.8, 31]} to={[3.2, 31]} />
      <Shape pts={[[2.75, 22], [3.25, 22], [3.25, 28], [2.75, 28]]} closed />
      <Segment from={[2.75, 25]} to={[3.25, 25]} />
    </Plot>
  );
}
```

