```figure
export const params = {
  az: { label: 'Azimuth', min: 0, max: 360, step: 5, value: 30, unit: '°' },
  el: { label: 'Elevation', min: 0, max: 90, step: 5, value: 30, unit: '°' },
};

export default function ({ az, el }) {
  const view = { azimuth: az, elevation: el };
  const lines = surface((x, y) => Math.sin(x) * Math.cos(y), [-3, 3], [-3, 3], { n: 12, ...view });
  const at = p => project(p, view);
  return (
    <Diagram id="surf" width={8} height={8}>
      {lines.map((pts, i) => <Shape id={'w' + i} pts={pts} />)}
      <Vector from={at([0, 0, 0])} to={at([4, 0, 0])} label="x" />
      <Vector from={at([0, 0, 0])} to={at([0, 4, 0])} label="y" />
      <Vector from={at([0, 0, 0])} to={at([0, 0, 1.6])} label="z" />
    </Diagram>
  );
}
```

The surface $z = \sin x \cos y$ has two peaks at $z = 1$, at $(\tfrac{\pi}{2}, 0)$ and $(-\tfrac{\pi}{2}, \pi)$. It has two troughs at $z = -1$, at $(-\tfrac{\pi}{2}, 0)$ and $(\tfrac{\pi}{2}, \pi)$. Drag the azimuth and elevation sliders to change the view.

Skipped: the grid is 12 lines per direction, and there are no axis tick labels. Not checked: the render in the host, so the Diagram's frame and the axis placement may need a small shift.