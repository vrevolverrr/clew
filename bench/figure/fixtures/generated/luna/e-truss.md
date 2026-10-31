Assuming pin supports at the two bottom end joints, no self-weight, and Pratt diagonals sloping toward the centre, the support reactions are **15 kN upward at each end**. The truss is symmetric.

```figure
export default function () {
  return (
    <Diagram id="truss" width={12} height={4}>
      <Shape id="bottom0" pts={[[0, 0.6], [3, 0.6]]} />
      <Shape id="bottom1" pts={[[3, 0.6], [6, 0.6]]} />
      <Shape id="bottom2" pts={[[6, 0.6], [9, 0.6]]} />
      <Shape id="bottom3" pts={[[9, 0.6], [12, 0.6]]} />
      <Shape id="top0" pts={[[0, 3.6], [3, 3.6]]} />
      <Shape id="top1" pts={[[3, 3.6], [6, 3.6]]} />
      <Shape id="top2" pts={[[6, 3.6], [9, 3.6]]} />
      <Shape id="top3" pts={[[9, 3.6], [12, 3.6]]} />
      <Shape id="vert0" pts={[[0, 0.6], [0, 3.6]]} />
      <Shape id="vert1" pts={[[3, 0.6], [3, 3.6]]} />
      <Shape id="vert2" pts={[[6, 0.6], [6, 3.6]]} />
      <Shape id="vert3" pts={[[9, 0.6], [9, 3.6]]} />
      <Shape id="vert4" pts={[[12, 0.6], [12, 3.6]]} />
      <Shape id="diag0" pts={[[0, 3.6], [3, 0.6]]} />
      <Shape id="diag1" pts={[[3, 3.6], [6, 0.6]]} />
      <Shape id="diag2" pts={[[9, 3.6], [6, 0.6]]} />
      <Shape id="diag3" pts={[[12, 3.6], [9, 0.6]]} />
      <Points pts={[[0, 0.6], [3, 0.6], [6, 0.6], [9, 0.6], [12, 0.6], [0, 3.6], [3, 3.6], [6, 3.6], [9, 3.6], [12, 3.6]]} />
      <Vector from={[3, 1.5]} to={[3, 0.7]} label="10 kN" />
      <Vector from={[6, 1.5]} to={[6, 0.7]} label="10 kN" />
      <Vector from={[9, 1.5]} to={[9, 0.7]} label="10 kN" />
      <Label at={[0, 0.1]} text="A" />
      <Label at={[3, 0.1]} text="B" />
      <Label at={[6, 0.1]} text="C" />
      <Label at={[9, 0.1]} text="D" />
      <Label at={[12, 0.1]} text="E" />
      <Label at={[0, 3.85]} text="F" />
      <Label at={[3, 3.85]} text="G" />
      <Label at={[6, 3.85]} text="H" />
      <Label at={[9, 3.85]} text="I" />
      <Label at={[12, 3.85]} text="J" />
      <Label at={[6, 0.25]} text="3 m panels; 3 m high" />
    </Diagram>
  );
}
```

At each joint, resolve member forces along the members and require horizontal and vertical forces to balance. The diagonals are at $45^\circ$, so each diagonal’s horizontal and vertical components have magnitude $F/\sqrt{2}$. Positive member force means tension; negative means compression.

| Members | Force |
|---|---:|
| Bottom chord AB, DE | 0 kN |
| Bottom chord BC, CD | 15 kN tension |
| Top chord FG, IJ | 21.21 kN compression |
| Top chord GH | 26.21 kN compression |
| Verticals AF, EJ | 15 kN compression |
| Verticals BG, DI | 5 kN compression |
| Vertical CH | 0 kN |
| Diagonals FB, JD | 21.21 kN tension |
| Diagonals GB, ID | 7.07 kN tension |

