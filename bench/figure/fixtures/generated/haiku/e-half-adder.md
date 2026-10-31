A half adder needs two gates: an XOR gate for the sum and an AND gate for the carry. The figure tool cannot draw logic gates, so here is the wiring in words.

Both gates take the same two inputs, A and B, and no gate feeds another gate:

1. Wire A to one input pin of the XOR gate and to one input pin of the AND gate.
2. Wire B to the other input pin of each gate.
3. Take the XOR output as the sum bit $S$.
4. Take the AND output as the carry bit $C$.

In Boolean form, $S = A \oplus B$ and $C = A \cdot B$.

| A | B | S | C |
|---|---|---|---|
| 0 | 0 | 0 | 0 |
| 0 | 1 | 1 | 0 |
| 1 | 0 | 1 | 0 |
| 1 | 1 | 0 | 1 |

Only $1 + 1$ produces a carry. In binary, $1 + 1 = 10$: sum 0, carry 1.