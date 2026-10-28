import { type App, Notice } from 'obsidian';

import { type DemoChat, scriptedSession } from '@/chat/obsidian/playHighlightDemo';

const fence = (program: string) => ['```openui-lang', program, '```'].join('\n');

// What an agent would write: a fence for each kind of visual, two fences that fail, and two fences that share a
// variable name.
export const VISUALS_DEMO_REPLY = [
  'Move the controls. Each one redraws the readouts and plots that use it, with no new message to me.',
  fence(`$k = 3
root = Stack([ctl, plot, degree, enough])
ctl = Slider("Terms in the series", 1, 8, 1, $k)
plot = Plot([-7, 7], [Line(@Curve("sin(x)", -7, 7), "sin x"), Line(@Curve("sum(j, 0, n - 1, (-1) ^ j * x ^ (2 * j + 1) / fact(2 * j + 1))", -7, 7, {n: $k}), "Taylor polynomial")], [-3, 3], "x")
degree = Stat("Degree of the polynomial", 2 * $k - 1)
enough = Stat("Close to sin x out to |x| = 3?", $k > 3 ? "yes" : "not yet", $k > 3 ? "good" : "bad")`),
  'A bell curve with its worst days shaded. Value at risk is where the shading ends:',
  fence(`$mu = 0.05
$sigma = 1.2
$conf = "95%"
z = $conf == "99%" ? 2.3263 : $conf == "90%" ? 1.2816 : 1.6449
cut = $mu - z * $sigma
root = Stack([m, s, c, plot, Stat("One-day value at risk", @Round(0 - cut, 2) + "%")])
m = Slider("Mean daily return", -0.5, 0.5, 0.05, $mu, "%")
s = Slider("Daily volatility", 0.5, 3, 0.1, $sigma, "%")
c = Choice("Confidence", ["90%", "95%", "99%"], $conf)
plot = Plot([-10, 10], [Line(@Curve("normpdf(x, mu, sigma)", -10, 10, {mu: $mu, sigma: $sigma}), "Daily returns"), Area(@Curve("normpdf(x, mu, sigma)", -10, cut, {mu: $mu, sigma: $sigma}), "Worst days", 2), Rule(cut, "x", "VaR")], null, "Daily return, %")`),
  'A waterfall from revenue to net income. The model gives the changes and the plot adds them up:',
  fence(`$cogs = 55
$opex = 300
ebt = 1200 - 12 * $cogs - $opex - 60
tax = ebt > 0 ? ebt * 0.25 : 0
root = Stack([a, b, plot, Stat("Net income", @Round(ebt - tax))])
a = Slider("Cost of goods, % of revenue", 30, 85, 1, $cogs, "%")
b = Slider("Operating expenses", 100, 500, 10, $opex, "$k")
plot = Plot(["Revenue", "Cost of goods", "Gross profit", "Operating expenses", "Operating income", "Interest", "Tax", "Net income"], [Bars([1200, 0 - 12 * $cogs, null, 0 - $opex, null, -60, 0 - tax, null], "waterfall")], null, null, "$k")`),
  'A cash-flow curve shares its discount rate with the readout. The dot sits at the rate you chose:',
  fence(`$r = 10
npv = @Eval("-1000 + 300 / (1 + r / 100) + 400 / (1 + r / 100) ^ 2 + 400 / (1 + r / 100) ^ 3 + 300 / (1 + r / 100) ^ 4", {r: $r})
root = Stack([ctl, plot, Stat("NPV at this rate", @Round(npv), npv > 0 ? "good" : "bad")])
ctl = Slider("Discount rate", 0, 30, 0.5, $r, "%")
plot = Plot([0, 30], [Line(@Curve("-1000 + 300 / (1 + x / 100) + 400 / (1 + x / 100) ^ 2 + 400 / (1 + x / 100) ^ 3 + 300 / (1 + x / 100) ^ 4", 0, 30), "NPV"), Dot($r, npv, "here"), Rule(0, "y")], null, "Discount rate, %", "NPV, $k")`),
  'An edit-distance table fills one cell per step. The newest cell is outlined and the cells it was worked out from are shaded:',
  fence(`$s = 0
root = Stack([Grid(["", "c", "u", "t"], ["", "c", "a", "t"], [[0, 1, 2, 3], [1, 0, 1, 2], [2, 1, 1, 2], [3, 2, 2, 1]], $s, 4, ["Row and column 0 are the cost of turning a prefix into nothing.", "Turning c into nothing takes 1 deletions: 1.", "c against c: the letters match, so copy the diagonal, 0.", "**c** against **u**: the letters differ, so take the cheapest neighbour and add 1, $\\min(1, 2, 0) + 1 = 1$.", "c against t: the letters differ, so take the cheapest neighbour and add 1, 2.", "Turning ca into nothing takes 2 deletions: 2.", "a against c: the letters differ, so take the cheapest neighbour and add 1, 1.", "a against u: the letters differ, so take the cheapest neighbour and add 1, 1.", "a against t: the letters differ, so take the cheapest neighbour and add 1, 2.", "Turning cat into nothing takes 3 deletions: 3.", "t against c: the letters differ, so take the cheapest neighbour and add 1, 2.", "t against u: the letters differ, so take the cheapest neighbour and add 1, 2.", "t against t: the letters match, so copy the diagonal, 1."], [[[0, 0]], [[0, 0], [0, 1], [1, 0]], [[0, 1], [0, 2], [1, 1]], [[0, 2], [0, 3], [1, 2]], [[1, 0]], [[1, 0], [1, 1], [2, 0]], [[1, 1], [1, 2], [2, 1]], [[1, 2], [1, 3], [2, 2]], [[2, 0]], [[2, 0], [2, 1], [3, 0]], [[2, 1], [2, 2], [3, 1]], [[2, 2], [2, 3], [3, 2]]]), Player(12, $s, 700)])`),
  'A quiz marks the answer on the spot and sends it to me as your next message, so I can carry on from it. Pick one and press Submit:',
  fence(`root = Stack([Quiz("What is the derivative of $\\sin x$?", ["$\\cos x$", "$-\\cos x$", "$\\sin x$"], "$\\cos x$", "The slope of the sine curve at $x$ is $\\cos x$.")])`),
  'A choice and a typed word share one figure:',
  fence(`$body = "Earth"
$word = "kitten"
root = Stack([pick, name, out])
pick = Choice("Gravity", ["Earth", "Moon", "Mars"], $body)
name = TextInput("A word", $word, 12)
out = TextContent("**" + $word + "** falls on the " + $body + ".")`),
  'A player steps a variable. Press Play, Pause, Next or Back, or drag the bar:',
  fence(`$s = 0
root = Stack([p, Stat("Step", $s + " of 6"), Stat("Progress", @Round($s / 6 * 100) + "%")])
p = Player(6, $s, 700)`),
  'A control with no variable keeps its position but nothing reads it:',
  fence('root = Stack([Slider("Volume", 0, 100, 5, 40, "%")])'),
  'These two fences both name their variable `$k`, yet each has its own:',
  fence(`$k = 1
root = Stack([Slider("First figure", 0, 10, 1, $k), Stat("Reads", $k)])`),
  fence(`$k = 1
root = Stack([Slider("Second figure", 0, 10, 1, $k), Stat("Reads", $k)])`),
  'A plot marks a point with a dot and shades the region between two curves:',
  fence(`cost = @Curve("x ^ 2 / 4", 0, 4)
rev = @Curve("0.75 * x", 0, 4)
root = Stack([Plot([0, 4], [Area(rev, "Profit", 3, cost, 0, 3), Line(cost, "Cost"), Line(rev, "Revenue"), Dot(3, 2.25, "break-even"), Note(3.8, 2.9, "loss")], [0, 4], "Units (thousands)", "Amount ($ thousands)")])`),
  'A callout boxes a definition, and a sequence numbers the steps of a method, all visible at once:',
  fence(`root = Stack([def, steps])
def = Callout("note", "Eigenvector", "A nonzero $v$ with $Av = \\lambda v$ for some scalar $\\lambda$.")
steps = Sequence([TextContent("**Form the characteristic polynomial.** Compute $\\det(A - \\lambda I)$."), TextContent("**Find its roots.** Each root is an eigenvalue."), TextContent("**Solve for each eigenvector.** Find the null space of $A - \\lambda I$.")])`),
  'A board moves blocks between named places, with its own Play, Back and Next:',
  fence(`root = Stack([board])
board = Board([{id: "ready", label: "Ready queue", slots: 3}, {id: "cpu", label: "CPU", slots: 1}, {id: "done", label: "Finished", slots: 3}], [Step("Three processes wait.", "P1 P2 P3 > ready"), Step("The scheduler runs P1.", "P1 > cpu; P1 ~ active"), Step("P1's time slice ends; it goes to the back.", "P1 > ready:0; P1 ~; P2 > cpu; P2 ~ active"), Step("P2 finishes.", "P2 > done; P2 ~ done; P3 > cpu; P3 ~ active")])`),
  'A network keeps its layout fixed while edges and nodes change state:',
  fence(`root = Stack([graph])
graph = Network([{id: "A"}, {id: "B"}, {id: "C"}, {id: "D", hidden: true}], [{id: "ab", from: "A", to: "B", label: "4"}, {id: "ac", from: "A", to: "C", label: "1"}, {id: "cb", from: "C", to: "B", label: "2"}, {id: "bd", from: "B", to: "D", label: "5"}], [Step("Start at A.", [Tag("A", "active")]), Step("The cheapest edge from A reaches C.", [Tag("ac", "active"), Tag("C", "active"), Tag("A", "done")]), Step("Through C, B costs 3, less than 4.", [Tag("ac", "done"), Tag("cb", "active"), Tag("ab", "dim"), Label("B", "B (3)")]), Step("D appears once B is settled.", [Show("D"), Tag("cb", "done"), Tag("bd", "active")]), Step("Hide A, which is done, and its edges.", [Hide("A")])])`),
  'A static diagram is Mermaid, not a visual:',
  ['```mermaid', 'flowchart LR', '  Q[Question] --> M{Model} --> A[Answer]', '```'].join('\n'),
  'A board that breaks its own rules shows why, and keeps its source to inspect:',
  fence('root = Stack([Board([{id: "desk", label: "Desk", slots: 1}], [Step("One parcel.", "A > desk"), Step("A second parcel.", "B > desk")])])'),
  'A fence with a component that does not exist still draws the rest:',
  fence('root = Stack([TextContent("This part renders."), Chart("bar")])'),
  'That is every kind of visual. Try them in a light and a dark theme.',
].join('\n\n');

/** Plays a scripted reply in a new chat, so the controls of a visual can be tried in the vault's theme without a model. */
export async function playVisualsDemo(app: App, openChat: () => Promise<DemoChat | null>): Promise<void> {
  const chat = await openChat();
  if (!chat) return;
  new Notice('Visuals demo: move each control and hover each plot, then switch between a light and a dark theme.');
  await chat.playTurn('Show me every control and plot.', scriptedSession(VISUALS_DEMO_REPLY), app.workspace.getActiveFile()?.path ?? '');
}
