$A$ maps the unit square to a parallelogram with corners $(0,0)$, $(2,1)$, $(3,3)$ and $(1,2)$. Its eigenvectors are $(1,1)$, with eigenvalue $3$, and $(1,-1)$, with eigenvalue $1$.

```figure
const A = [[2, 1], [1, 2]];
const apply = p => [A[0][0] * p[0] + A[0][1] * p[1], A[1][0] * p[0] + A[1][1] * p[1]];
const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
const image = square.map(apply);

export default function () {
  const steps = [
    { heading: 'Unit square', text: 'The unit square has corners $(0,0)$, $(1,0)$, $(1,1)$ and $(0,1)$.', orig: 'active', img: null, eig: false },
    { heading: 'Image under A', text: 'Each corner $p$ moves to $Ap$. The square becomes a parallelogram with corners $(0,0)$, $(2,1)$, $(3,3)$ and $(1,2)$.', orig: 'dim', img: 'active', eig: false },
    { heading: 'Eigenvectors', text: 'Along $v_1=(1,1)$, $A$ stretches by $3$. Along $v_2=(1,-1)$, $A$ leaves the vector unchanged, so its eigenvalue is $1$.', orig: 'dim', img: 'done', eig: true },
  ];
  return (
    <Figure steps={steps} caption={step => step.text} heading={step => step.heading} render={step => (
      <Plot id="plane" x={[-0.5, 3.5]} y={[-1.5, 3.5]} xLabel="x" yLabel="y">
        <Shape id="orig" pts={square} closed label="unit square" tag={step.orig} />
        {step.img && <Shape id="image" pts={image} closed label="image of square" tag={step.img} />}
        {step.eig && <Vector id="v1" from={[0, 0]} to={[1, 1]} label="$v_1$, eigenvalue $3$" tag="match" />}
        {step.eig && <Vector id="v2" from={[0, 0]} to={[1, -1]} label="$v_2$, eigenvalue $1$" tag="match" />}
      </Plot>
    )} />
  );
}
```

An eigenvector of $A$ is a nonzero vector $v$ whose direction does not change when $A$ acts on it. Only its length changes, by a factor $\lambda$ called the eigenvalue:

$$Av = \lambda v$$

Here $A$ is the matrix, $v$ the vector and $\lambda$ a number. Check $v_1=(1,1)$:

$$A v_1 = \begin{pmatrix}2&1\\1&2\end{pmatrix}\begin{pmatrix}1\\1\end{pmatrix} = \begin{pmatrix}3\\3\end{pmatrix} = 3\,v_1$$

Check $v_2=(1,-1)$: $Av_2 = (2-1,\ 1-2) = (1,-1) = 1\cdot v_2$.

The area scales by $\det A = 2\cdot 2 - 1\cdot 1 = 3$. The unit square has area $1$, and the parallelogram has area $3$.

Skipped: no code was run and no tests were added. The figure coordinates were checked by hand, not rendered.