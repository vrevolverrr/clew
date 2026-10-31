export default function () {
  const options = [
    'The series $\\sum_{n=1}^{\\infty} \\frac{1}{n^p}$ converges for every $p > 0$ because its terms go to zero.',
    'It converges exactly when $p > 1$, by the integral test applied to $\\int_1^{\\infty} x^{-p}\\,dx$.',
    'It converges exactly when $p \\geq 1$, since the harmonic series is the boundary case.',
    'It diverges for every $p$, because a sum of positive terms is always infinite.',
    'It converges only for integer $p$ greater than one.',
    'It converges when $p > 1/2$ by comparison with a geometric series.',
    'Convergence depends on the order of the terms.',
    'None of these.',
  ];
  return <Quiz question="For which $p$ does $\sum_{n=1}^{\infty} n^{-p}$ converge? Pick the statement that is true and gives the right reason." options={options} correct={options[1]} explanation="The integral test: $\int_1^{\infty} x^{-p}\,dx$ is finite exactly when $p > 1$." />;
}
