/** A set of components and functions the model learns about only when it asks for them. */
interface Pack {
  /** One line for the system prompt, saying what the pack draws. */
  summary: string;
  components: readonly string[];
  functions: readonly string[];
  /** A figure that parses and draws, shown with the pack's syntax. Keep its topic far from what students ask. */
  example?: string;
  /** What the pack's arguments are, said before the example. */
  argumentNote?: string;
}

export const PACKS = {
  board: {
    summary: 'things in named places that move between them, step by step: blocks entering and leaving memory, a call stack, queues, buffers, accounts, rows being reduced. Use it when the places are the point',
    components: ['Board', 'Step'],
    functions: [],
    example: "root = Stack([board])\nboard = Board([{id: \"inbox\", label: \"Inbox\", slots: 2}, {id: \"desk\", label: \"Sorting desk\", slots: 1}, {id: \"outbox\", label: \"Outbox\", slots: 2}, {id: \"log\", label: \"Receipts\", slots: 2}], [Step(\"A parcel arrives.\", \"P > inbox; P = 'Parcel'\"), Step(\"Move it onto the desk.\", \"P > desk; P ~ active\"), Step(\"Keep a receipt.\", \"P >> log; P_copy = 'Receipt'\"), Step(\"Send the parcel onward.\", \"P > outbox; P ~ done\")])",
  },
  network: {
    summary: 'things joined by links: graphs, trees, state machines, computer networks. Use it when the connections are the point, and when an edge has its own state (visited, in the tree, weight)',
    components: ['Network', 'Step', 'Tag', 'Label', 'Show', 'Hide'],
    functions: [],
    example: "root = Stack([network])\nnetwork = Network([{id: \"W\", label: \"Warehouse\"}, {id: \"D\", label: \"Depot\"}, {id: \"H\", label: \"Hub\", hidden: true}], [{id: \"express\", from: \"W\", to: \"D\", label: \"Express\", directed: true}, {id: \"local\", from: \"W\", to: \"D\", label: \"Local\", directed: true}, {id: \"return\", from: \"D\", to: \"W\", directed: true}, {id: \"extension\", from: \"D\", to: \"H\"}], [Step(\"Choose the express road.\", [Tag(\"express\", \"active\")]), Step(\"Return after delivery.\", [Tag(\"express\", \"done\"), Tag(\"return\", \"active\")]), Step(\"The hub opens.\", [Show(\"H\"), Tag(\"return\")]), Step(\"The local road is quiet.\", [Tag(\"local\", \"dim\")])])",
  },
  grid: {
    summary: 'a table that fills in step by step, such as a dynamic-programming trace',
    components: ['Grid'],
    functions: [],
  },
  plot: {
    summary: 'graphs of functions and data: curves, areas, bars, waterfalls, markers; use it whenever the idea is a function, a distribution, a trend, or the effect of a parameter',
    components: ['Plot', 'Line', 'Area', 'Bars', 'Dot', 'Rule', 'Note'],
    functions: ['Curve', 'Eval'],
    argumentNote: 'a label is text and a series is a number',
    example: `$v = 20
peak = @Eval("round(v ^ 2 / 19.6)", {v: $v})
tpeak = @Eval("v / 9.8", {v: $v})
root = Stack([ctl, plot, Stat("Peak height (m)", peak)])
ctl = Slider("Launch speed", 5, 40, 1, $v, "m/s")
plot = Plot([0, 8], [Line(@Curve("v * x - 4.9 * x ^ 2", 0, 8, {v: $v}), "Height"), Dot(tpeak, peak, "peak"), Rule(0, "y")], [0, 85], "Time, s", "Height, m")`,
  },
} as const satisfies Record<string, Pack>;

export type PackName = keyof typeof PACKS;

export const PACK_NAMES = Object.keys(PACKS) as PackName[];

/** One line each for the system prompt and the tool: the pack's name and what it draws. */
export const PACK_LIST = PACK_NAMES.map((name) => `${name} (${PACKS[name].summary})`).join('; ');

/** A signature with its description, as the model reads it. */
export function describeEntry(entry: { signature: string; description?: string }): string {
  return `${entry.signature}${entry.description ? ` — ${entry.description}` : ''}`;
}
