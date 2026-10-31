An elastic collision conserves both total momentum and kinetic energy. In one dimension, that also means the objects separate at the same relative speed at which they approached.

Here, the 2 kg object approaches at 3 m/s and the 1 kg object is at rest. Let their final velocities be $v_1$ and $v_2$. Conservation of momentum gives:

$$2(3)+1(0)=2v_1+v_2$$

The initial relative speed is $3-0=3$ m/s, so after the collision:

$$v_2-v_1=3$$

Substitute $v_2=v_1+3$ into the momentum equation: $6=2v_1+(v_1+3)$, so $v_1=1$ m/s and $v_2=4$ m/s. Both move forward after the collision.

```figure
export default function () {
  const steps = [
    { stage: 'Before', v1: '3 m/s', v2: '0 m/s', p: '6 kg·m/s', ke: '9 J',
      text: 'Initially, the 2 kg object moves and the 1 kg object is at rest.' },
    { stage: 'Solve', v1: 'v₁', v2: 'v₁ + 3', p: '6 kg·m/s', ke: '9 J',
      text: 'Use momentum conservation and the elastic collision relative-speed rule.' },
    { stage: 'After', v1: '1 m/s', v2: '4 m/s', p: '6 kg·m/s', ke: '9 J',
      text: 'The results preserve total momentum and kinetic energy.' }
  ];
  return <Figure steps={steps} caption={step => step.text} render={step => (
    <Table id="collision" title={step.stage}
      columns={['Quantity', '2 kg object', '1 kg object', 'Total']}
      rows={[
        ['Velocity', step.v1, step.v2, null],
        ['Momentum', '2v₁', 'v₂', step.p],
        ['Kinetic energy', '½·2·v₁²', '½·1·v₂²', step.ke]
      ]}
      rowIds={['velocity', 'momentum', 'energy']} />
  )} />;
}
```

Check: initially the kinetic energy is $\frac12(2)(3^2)=9$ J. Finally it is $\frac12(2)(1^2)+\frac12(1)(4^2)=9$ J, as required.

