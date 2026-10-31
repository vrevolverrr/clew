import type { App } from 'obsidian';

import type { DemoChat } from '@/chat/obsidian/playHighlightDemo';
import { fence, playScriptedTurns } from '@/chat/obsidian/playVisualsDemo';

const LISTED = String.raw`const g = 10, top = 11.25;

export default function () {
  const steps = [0, 0.5, 1, 1.5].map(t => ({ t, y: top - (g * t * t) / 2, v: g * t }));
  return <Figure steps={steps} heading={s => (s.t === 0 ? 'Released' : 'After ' + s.t + ' s')} caption={s => 'At $t = ' + s.t + '$ s the ball is ' + s.y + ' m up, falling at ' + s.v + ' m/s.'} render={s => (
    <Diagram width={8} height={top}>
      <Segment from={[0, 0]} to={[8, 0]} />
      <Shape pts={[[0, 0], [3, 0], [3, top], [0, top]]} closed label="tower" />
      <Points pts={[[5, s.y]]} label={s.y + ' m'} tag="active" />
      {s.v > 0 && <Vector from={[5, s.y]} to={[5, s.y - s.v / 5]} label="v" tag="active" />}
    </Diagram>
  )} />;
}`;

const MANY = String.raw`const start = [5, 2, 4, 6, 1, 3, 8, 7];

export default function () {
  const a = start.slice();
  const steps = [{ a: a.slice(), sorted: 1, heading: 'Start', text: 'The first item alone is a sorted run.' }];
  for (let i = 1; i < a.length; i++) {
    const key = a[i];
    let j = i - 1;
    while (j >= 0 && a[j] > key) { a[j + 1] = a[j]; j--; }
    a[j + 1] = key;
    const moved = i - 1 - j;
    steps.push({ a: a.slice(), sorted: i + 1, key, heading: 'Insert ' + key, text: (moved ? 'Shift ' + moved + (moved === 1 ? ' larger item' : ' larger items') + ' right and drop ' + key + ' at index ' + (j + 1) : key + ' already sits after everything smaller') + '. The first ' + (i + 1) + ' items are sorted.' });
  }
  return <Figure steps={steps} heading={s => s.heading} caption={s => s.text} render={s => (
    <Seq id="a" items={s.a.map(v => ({ id: 'v' + v, label: v }))} index
      tags={Object.fromEntries(s.a.map((v, k) => ['v' + v, v === s.key ? 'active' : k < s.sorted ? 'done' : 'dim']))} />
  )} />;
}`;

const ONE_CAPTIONED = String.raw`export default () => (
  <Figure steps={[0]} caption={() => 'A 3, 4, 5 right triangle: $3^2 + 4^2 = 5^2$.'} render={() => (
    <Diagram width={4} height={3}>
      <Shape pts={[[0, 0], [4, 0], [4, 3]]} closed />
      <RightAngle at={[4, 0]} from={[0, 0]} to={[4, 3]} />
      <Label at={[2, -0.3]} text="4" />
      <Label at={[4.3, 1.5]} text="3" />
      <Label at={[1.8, 1.7]} text="5" />
    </Diagram>
  )} />
);`;

const ONE_BARE = String.raw`export default function () {
  const hexagon = Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]);
  return (
    <Diagram width={2} height={2}>
      <Shape pts={hexagon} closed />
      <Circle at={[0, 0]} r={1} />
    </Diagram>
  );
}`;

const WIDE = String.raw`export default function () {
  const steps = [1, 2, 3].map(n => ({ n }));
  return <Figure steps={steps} caption={s => 'Add $x^' + s.n + '$: each higher power is flatter near 0 and steeper past 1.'} render={s => (
    <Plot id="powers" x={[-1.5, 1.5]} y={[-2, 2]} xLabel="x">
      {steps.filter(t => t.n <= s.n).map(t => <Fn id={'x' + t.n} f={x => x ** t.n} label={'$x^' + t.n + '$'} tag={t.n === s.n ? 'active' : undefined} />)}
    </Plot>
  )} />;
}`;

const OVERFLOW = String.raw`const bases = [2, 3, 5];
const powers = Array.from({ length: 15 }, (_, n) => n);

export default function () {
  const steps = bases.map((b, i) => ({ i, b }));
  return <Figure steps={steps} caption={s => 'Powers of ' + s.b + ': the row grows by a factor of ' + s.b + ' each column.'} render={s => (
    <Table id="powers" columns={['n'].concat(powers.map(String))} rowIds={bases.map(b => 'b' + b)}
      rows={bases.map((b, i) => [b + 'ⁿ'].concat(powers.map(n => (i <= s.i ? b ** n : null))))}
      tags={{ ['b' + s.b]: 'active' }} />
  )} />;
}`;

/** One figure per layout the figure view can take, so each can be checked at several pane widths. */
export const LAYOUT_DEMO_TURNS: readonly { message: string; reply: string }[] = [
  {
    message: 'Show me how narrow figures lay out.',
    reply: [
      'Two to six steps beside a narrow drawing list every step, each with its heading over its caption:',
      fence(LISTED),
      'More than six steps show one step at a time, numbered, with the full player:',
      fence(MANY),
      'One step with a caption shows it beside the drawing, with no player:',
      fence(ONE_CAPTIONED),
      'One step with no caption is the drawing alone:',
      fence(ONE_BARE),
    ].join('\n\n'),
  },
  {
    message: 'And wide ones?',
    reply: [
      'A plot takes the pane\'s width, so its steps go under it:',
      fence(WIDE),
      'A table wider than the pane scrolls sideways, with its steps under it:',
      fence(OVERFLOW),
      'Narrow the pane until the steps move under each drawing, then widen it again.',
    ].join('\n\n'),
  },
];

/** One figure per layout, so each can be checked while the pane is resized. */
export function playLayoutDemo(app: App, openChat: () => Promise<DemoChat | null>): Promise<void> {
  return playScriptedTurns(app, openChat, 'Figure layout demo: resize the pane and step through each figure.', LAYOUT_DEMO_TURNS);
}
