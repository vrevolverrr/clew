Each horizontal line is a 95% confidence interval from a repeated sample. The vertical line marks the true mean; one interval misses it.

```figure
const intervals = [
  [46, 54], [47, 55], [44, 52], [45, 53], [48, 56],
  [43, 51], [46, 54], [47, 55], [44, 52], [45, 53],
  [48, 56], [46, 54], [43, 51], [47, 55], [44, 52],
  [45, 53], [46, 54], [48, 56], [43, 51], [54, 62]
];

export default function () {
  return (
    <Figure
      steps={[{ text: 'One of the 20 intervals misses the true mean.' }]}
      caption={step => step.text}
      render={() => (
        <Plot id="intervals" x={[40, 64]} y={[0, 21]} xLabel="Value" yLabel="Repeated sample">
          <Vector from={[50, 0]} to={[50, 21]} label="True mean" />
          {intervals.map(([lo, hi], i) => (
            <Shape
              id={`ci${i + 1}`}
              pts={[[lo, i + 1], [hi, i + 1]]}
              label={`Sample ${i + 1}`}
              tag={i === 19 ? 'bad' : 'good'}
            />
          ))}
        </Plot>
      )}
    />
  );
}
```

