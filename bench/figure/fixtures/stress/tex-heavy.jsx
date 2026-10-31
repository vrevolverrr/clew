export default function () {
  const row = i => [1, 2, 3, 4, 5, 6].map(j => 'a_{' + i + j + '}').join(' & ');
  const steps = [
    { tex: '\\det\\begin{pmatrix}' + [1, 2, 3, 4, 5, 6].map(row).join(' \\\\ ') + '\\end{pmatrix} = \\sum_{\\sigma \\in S_6} \\operatorname{sgn}(\\sigma) \\prod_{i=1}^{6} a_{i,\\sigma(i)}', text: 'The Leibniz formula over all $6! = 720$ permutations.' },
    { tex: '\\begin{aligned} \\int_0^{\\infty} \\frac{\\sin x}{x}\\,dx &= \\int_0^{\\infty}\\!\\!\\int_0^{\\infty} e^{-xt}\\sin x\\,dt\\,dx \\\\ &= \\int_0^{\\infty} \\cssId{inner}{\\frac{1}{1+t^2}}\\,dt \\\\ &= \\left[\\arctan t\\right]_0^{\\infty} = \\frac{\\pi}{2} \\end{aligned}', text: 'A long derivation with an anchor on the inner integral.', mark: true },
  ];
  return <Figure steps={steps} caption={step => step.text} render={step => (
    <Column>
      <Tex id="t" tex={step.tex} />
      {step.mark && <Pointer to="inner" name="swap the order of integration" />}
    </Column>
  )} />;
}
