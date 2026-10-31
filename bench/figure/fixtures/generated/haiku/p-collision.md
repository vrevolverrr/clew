An elastic collision is a crash where the objects bounce apart and no kinetic energy turns into heat, sound, or permanent deformation. Momentum stays the same in every collision with no outside force. Kinetic energy stays the same only in an elastic collision.

For two bodies moving along one line, with masses $m_1$, $m_2$, velocities $u_1$, $u_2$ before, and $v_1$, $v_2$ after, both of these hold:

$$m_1u_1 + m_2u_2 = m_1v_1 + m_2v_2$$

$$\tfrac12 m_1u_1^2 + \tfrac12 m_2u_2^2 = \tfrac12 m_1v_1^2 + \tfrac12 m_2v_2^2$$

Masses are in kg and velocities in m/s. Velocities are signed, so a velocity to the left is negative. Both equations need no outside force during the collision and no energy lost to another form.

## Worked example

Take $m_1 = 2$ kg, $u_1 = 3$ m/s, $m_2 = 1$ kg, $u_2 = 0$. The figure steps through the collision.

```figure
export default function () {
  const m1 = 2, m2 = 1, u1 = 3, u2 = 0;
  const v1 = ((m1 - m2) * u1 + 2 * m2 * u2) / (m1 + m2);
  const v2 = (2 * m1 * u1 + (m2 - m1) * u2) / (m1 + m2);
  const p0 = m1 * u1 + m2 * u2;
  const k0 = 0.5 * m1 * u1 ** 2 + 0.5 * m2 * u2 ** 2;
  const p1 = m1 * v1 + m2 * v2;
  const k1 = 0.5 * m1 * v1 ** 2 + 0.5 * m2 * v2 ** 2;
  const steps = [
    { a: u1, b: u2, tagA: 'active', tagB: 'dim', after: false,
      text: `Before the collision. Block A moves at ${u1} m/s and block B rests. Total momentum is ${p0} kg m/s.` },
    { a: v1, b: v2, tagA: 'new', tagB: 'new', after: true,
      text: `After the collision. Momentum is still ${p1} kg m/s and kinetic energy is still ${k1} J.` },
  ];
  return (
    <Figure steps={steps} caption={step => step.text} render={step => (
      <Column gap="md">
        <Row gap="md" align="center">
          <Node id="A" label={`A: ${m1} kg`} sub={`${step.a} m/s`} tag={step.tagA} />
          <Node id="B" label={`B: ${m2} kg`} sub={`${step.b} m/s`} tag={step.tagB} />
        </Row>
        <Table id="sum" columns={["Quantity", "Before", "After"]} rowIds={["p", "k"]}
          rows={[
            ["Momentum (kg m/s)", p0, step.after ? p1 : null],
            ["Kinetic energy (J)", k0, step.after ? k1 : null],
          ]} />
      </Column>
    )} />
  );
}
```

**Step 1.** Put the known values into both equations:

$$6 = 2v_1 + v_2$$

$$9 = v_1^2 + \tfrac12 v_2^2$$

**Step 2.** Solve the momentum equation for $v_2$: $v_2 = 6 - 2v_1$. Put this into the energy equation:

$$9 = v_1^2 + \tfrac12(6 - 2v_1)^2 = 3v_1^2 - 12v_1 + 18$$

This gives $v_1^2 - 4v_1 + 3 = 0$, so $(v_1 - 1)(v_1 - 3) = 0$.

**Step 3.** The root $v_1 = 3$ means nothing changed, so take $v_1 = 1$ m/s. Then $v_2 = 6 - 2(1) = 4$ m/s.

**Step 4.** Check both quantities. Momentum: $2(1) + 1(4) = 6$ kg m/s. Energy: $\tfrac12(2)(1)^2 + \tfrac12(1)(4)^2 = 9$ J. Both match the values before the collision.

The result stops holding once kinetic energy is lost, as when two lumps of clay stick together. Then only momentum is conserved, and you need another condition to solve the problem.