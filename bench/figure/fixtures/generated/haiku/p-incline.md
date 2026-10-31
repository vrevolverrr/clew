```figure
export const params = {
  theta: { label: 'Incline angle', min: 5, max: 60, step: 1, value: 20, unit: '°' }
};

const M = 5;             // block mass, kg
const G = 9.8;           // gravity, m/s²
const W = M * G;         // weight, N
const MU_S = 0.4;        // static friction coefficient
const MU_K = 0.3;        // kinetic friction coefficient
const K = 0.03;          // drawing scale, m per N
const S = 1;             // block side, m

const add = (p, v, k = 1) => [p[0] + k * v[0], p[1] + k * v[1]];

export default function ({ theta }) {
  const a = theta * Math.PI / 180;
  const d = [Math.cos(a), Math.sin(a)];      // up the slope
  const n = [-Math.sin(a), Math.cos(a)];     // out of the surface
  const c = [5, 4.5];                        // block centre
  const q = add(c, n, -S / 2);               // contact point under the block
  const L0 = add(q, d, -3.5);                // surface, lower end
  const L1 = add(q, d, 3.5);                 // surface, upper end
  const corner = (sx, sy) => add(add(c, d, sx * S / 2), n, sy * S / 2);

  const N = W * Math.cos(a);
  const slides = Math.tan(a) > MU_S;
  const F = slides ? MU_K * N : W * Math.sin(a);
  const fDir = slides ? [-d[0], -d[1]] : d;

  const info = {
    text: slides
      ? `$\\tan\\theta = ${Math.tan(a).toFixed(2)} > \\mu_s = ${MU_S}$: the block slides. Friction acts down the slope, $f = \\mu_k N = ${F.toFixed(0)}$ N.`
      : `$\\tan\\theta = ${Math.tan(a).toFixed(2)} \\le \\mu_s = ${MU_S}$: the block stays at rest. Friction acts up the slope, $f = mg\\sin\\theta = ${F.toFixed(0)}$ N.`
  };

  return (
    <Figure steps={[info]} title="Block on a rough incline" caption={s => s.text} render={() => (
      <Diagram id="fbd" width={10} height={8}>
        <Segment from={L0} to={L1} />
        <Segment from={L0} to={add(L0, [3, 0])} />
        <Angle at={L0} from={add(L0, [1.5, 0])} to={L1} label="$\\theta$" />
        <Shape pts={[corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]} closed label="m" />
        <Vector from={c} to={add(c, [0, -1], W * K)} label={`$W = ${W.toFixed(0)}$ N`} />
        <Vector from={c} to={add(c, n, N * K)} label={`$N = mg\\cos\\theta = ${N.toFixed(0)}$ N`} />
        <Vector from={c} to={add(c, fDir, F * K)}
          label={slides ? `$f = \\mu_k N = ${F.toFixed(0)}$ N` : `$f = mg\\sin\\theta = ${F.toFixed(0)}$ N`}
          tag={slides ? 'bad' : 'good'} />
      </Diagram>
    )} />
  );
}
```

Drag the θ slider to change the angle. Friction changes direction when the block starts to slide.

- $W = mg$: weight, always straight down.
- $N = mg\cos\theta$: normal force, perpendicular to the surface.
- $f$: friction, along the surface. While the block stays still, it acts up the slope with $f = mg\sin\theta$. Once it slides, it acts down the slope with $f = \mu_k N$.

The block stays at rest while $\tan\theta \le \mu_s = 0.4$, which is $\theta \le 21.8^\circ$.

Not done: $\mu_s$, $\mu_k$ and the 5 kg mass are fixed in code. Add sliders if you want them. Not run: I did not render the figure in the app, so check the arrow lengths and labels at a few angles.