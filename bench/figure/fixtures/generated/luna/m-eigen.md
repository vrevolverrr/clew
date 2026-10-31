The matrix sends each point $(x,y)$ to $(2x+y,\;x+2y)$. So the unit square becomes a parallelogram. Its two diagonal directions are eigenvectors: $(1,1)$ is stretched by a factor of $3$, while $(1,-1)$ keeps its length.

```figure
export default function () {
  const shift = p => [p[0] + 1.2, p[1] + 1.2];
  const origin = shift([0, 0]);
  return (
    <Diagram id="transform" width={5.6} height={5.6}>
      <Shape id="square" pts={[[0,0],[1,0],[1,1],[0,1],[0,0]].map(shift)} closed label="Unit square" tag="dim" />
      <Shape id="image" pts={[[0,0],[2,1],[3,3],[1,2],[0,0]].map(shift)} closed label="Image" tag="new" />
      <Vector from={origin} to={shift([3,3])} label="(1,1), λ = 3" tag="active" />
      <Vector from={origin} to={shift([1,-1])} label="(1,−1), λ = 1" tag="match" />
    </Diagram>
  );
}
```

The square’s corners map to $(0,0)$, $(2,1)$, $(1,2)$, and $(3,3)$. The arrows show the eigenvector directions from the origin; their endpoints show how the matrix scales those vectors.

