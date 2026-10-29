/** The figure contract the system prompt carries: what a figure program may write, and the rules the host checks. */
export const FIGURE_PROMPT = `Write the figure in a \`\`\`figure fence.

### The program

\`\`\`figure
export const params = { n: { label: 'Terms', min: 1, max: 8, step: 1, value: 3 } };   // optional

export default function ({ n }) {
  const steps = [];                 // one plain value per step, built with ordinary code
  // ...
  return <Figure steps={steps} caption={step => step.text} render={step => (/* the tree for this step */)} />;
}
\`\`\`

- The default export is a function of the parameters (an object; \`{}\` when there are none). It returns \`<Figure>\` or, for a static drawing, one element tree (drawn as a single step without playback).
- \`<Figure steps caption render title?>\`: \`steps\` is an array of 1 to 64 plain values, one per step. \`render(step, i)\` returns the tree for that step. \`caption(step, i)\` returns the step's caption: Markdown with \`$...$\` maths, required when there are two or more steps. \`title\` is optional text over the figure.
- Ordinary JavaScript: loops, local functions, arrays, \`Math\`, template strings. No imports, no DOM, no network, no React. The elements below exist already; nothing else does. The data the figure shows is written into the program as literals, and every number shown is computed by the program from them.
- Name the step parameter \`step\` (not \`f\`, which models then reuse for a curve function). Do not declare a variable with an element's name.
- Return the same structure in every step and change text and tags. Give an \`id\` to anything an arrow or pointer points at, anything tagged, and anything that should keep its place between steps.
- Any string prop is Markdown and may hold \`$maths$\`. Numbers are printed with up to six significant digits, so \`0.1 + 0.2\` reads \`0.3\`; format money yourself.
- An error stops the figure: check every array you index, and that a function you call exists in the step it is called in.

### Elements

Layout:

- \`<Row gap="sm|md|lg" align="start|center|end">\`: side by side; wraps when the pane is narrow.
- \`<Column gap align>\`: stacked.
- \`<Panel title tag id>\`: a titled box around a group.

Objects (all take \`id\`; \`title\`, \`label\` and cells are text):

- \`<Table id title columns={[...]} rows={[[...]]} rowIds={[...]} tags={{rowId: tag}} />\`: one row per \`rowId\`, each row one cell per column; a cell is text, a number or \`null\`. A cell has the id \`rowId.column\` (0-based column), so a tag, \`Arrow\` or \`Pointer\` can address one cell: a DP table, a Punnett square or a pipeline marks \`{ 'r2.3': 'active' }\`.
- \`<Seq id title items={[{id, label}]} index tags={{itemId: tag}} />\`: a strip of cells for an array, queue or string. \`index\` shows 0, 1, 2… above the cells, or an array of labels.
- \`<Node id label sub shape="box|circle" tag />\`: one labelled box or circle, with an optional second smaller line; also the stat tile (\`label\` the value, \`sub\` what it is).
- \`<Text>...</Text>\` or \`<Text text />\`: a paragraph. \`<Tex tex />\`: a displayed formula. Matrices, derivations and determinants are \`Tex\` in each step; there is no matrix element. All TeX follows the TeX rule below.
- \`<Graph id nodes={[{id, label, sub}]} edges={[{id, from, to, label, directed}]} tags={{nodeOrEdgeId: tag}} />\`: nodes and links placed by the host, a single rooted tree as a tree. Keep the same node ids in every step; change labels and tags. A binary tree node with one child gets a dimmed \`nil\` node for the other, so left and right stay apart. Put a small Graph and its Table side by side in a \`Row\`; beside a Graph of more than about six nodes, give per-node values as a wide Table, one column per node and one row per quantity, under it in a \`Column\`.
- \`<Quiz question options={[...]} correct explanation />\`: a multiple-choice check; \`correct\` is one of the options, written exactly as in \`options\`. The host marks the answer and sends it as the student's next message, so ask one and wait.

Links, placed anywhere in the tree and attached by id:

- \`<Arrow from to label tag />\`: an arrow between any two elements, rows, items or nodes.
- \`<Pointer to name tag />\`: a named marker under a Seq item, left of a Table row, or beside any element.

Two drawings, each holding layers in its own coordinates:

- \`<Plot id x={[lo, hi]} y={[lo, hi]} xLabel yLabel>\`: axes in data coordinates, \`x\` required, \`y\` fitted when absent.
- \`<Diagram id width height>\`: a free drawing in the model's own units (metres, grid cells), y upwards, scaled by the host to fit the pane; \`width\` and \`height\` are the extent of the drawing in its units.

Layers of both: \`<Shape pts={[[x, y], ...]} closed label tag id />\` (a polyline or polygon: a contour, a parametric curve, a path of iterates, a unit square under a map; one point draws nothing, so a growing path can start empty), \`<Circle at={[x, y]} r label tag id />\`, \`<Vector from to label tag />\` (an arrowhead at \`to\`, no dots), \`<Segment from to label tag />\`, \`<Points pts={[[x, y]]} label tag />\` and \`<Label at text />\`.

Plot only: \`<Fn id f={x => ...} from to label tag />\` (sampled by the host; the line breaks where it leaves the box through the top and comes back through the bottom, so \`tan\` and \`1/x\` draw no false vertical) and \`<Region top="fnId or number" base from to label tag />\` (shaded between \`top\` and \`base\`, default 0; a number \`top\` with \`from\` and \`to\` is a bar, so a histogram or a Riemann sum is one \`Region\` per bar).

Diagram only, geometry marks placed and sized by the host: \`<Angle at from to label tag />\` (the arc of the angle at \`at\` from the ray towards \`from\` to the ray towards \`to\`, label outside the arc), \`<RightAngle at from to />\` (the square mark), \`<Tick on={[a, b]} n tag />\` (\`n\` equal-length ticks across segment a–b) and \`<Dimension from to label />\` (a measured length with end bars, offset from the drawing).

Construction functions, in scope like \`Math\`, so points are computed rather than guessed: \`intersect(lineA, lineB)\` (a line is \`[p, q]\`; returns the point or \`null\` when parallel), \`foot(p, line)\` (the foot of the perpendicular), \`rotate(p, about, degrees)\` (counter-clockwise), \`along(a, b, t)\` (the point a + t·(b − a)), \`circleThrough(a, b, c)\` (returns \`{at, r}\`), \`dist(a, b)\`. They are plain JavaScript defined before the program and are not elements.

Parameters the student can change, declared by \`export const params\`, one entry per control, read as the argument of the default export:

- A slider: \`{ label, min, max, step, value, unit? }\`.
- A choice: \`{ label, options: [...], value }\`.
- A text field: \`{ label, value, text: true }\`.

The host draws the controls above the figure and runs the program again with the new values, keeping the current step when the step count is unchanged.

Cards: \`Node\`s in the same \`Row\` take the height of the tallest, and a Row of Nodes directly under a drawing in a \`Column\` starts at that drawing's left edge, so stat cards line up with what they describe. Beside a Diagram, put its cards in a \`Column\` to its right, both in a \`Row\`: the pane is narrow, and the Row puts them under the drawing only when they do not fit.

Do not draw electrical circuits or logic gates; say a figure cannot show them and describe them in prose.

### Tags

A tag marks state; the host shows what each means in a key under the figure, so never explain colours. \`active\`: being worked on now (outlined, ▶). \`done\` (✓, muted). \`match\`: a found or equal pair. \`new\`: just added or changed. \`dim\`: out of play. \`good\`, \`bad\`: a verdict.

### TeX in figures

Write ordinary MathJax wherever TeX appears: \`Tex\`, captions, \`Text\`, and \`$...$\` in any label or cell. Two things are the host's:

- Colour. In \`\\rowcolor{c}\`, \`\\cellcolor{c}\`, \`\\colorbox{c}{...}\`, \`\\bbox[c]{...}\` and \`\\color{c}{...}\`, the colour \`c\` is one of the seven tag names. The host replaces it with the current theme's colour for that tag and redraws on a theme change. Any other colour (\`red\`, \`#d0453a\`, \`rgb(...)\`) and \`\\definecolor\` fail validation with the allowed tags named.
- Anchors. \`\\cssId{name}{...}\` marks a part of a formula as an anchor: \`name\` joins the step's ids, follows the id rules, and an \`Arrow\` or \`Pointer\` can target it. \`\\class\` and \`\\data\` are the host's and fail validation.

Everything else in MathJax stays allowed, including \`\\cancel\`, \`\\underbrace\`, \`\\overbrace\` and \`array\` with a \`|\` for an augmented matrix. A row reduction step:

\`\`\`tex
\\left[\\begin{array}{ccc|c}
2 & 1 & -1 & 5 \\\\
\\rowcolor{new} \\cssId{r2}{0} & 3 & 2 & 4 \\\\
-2 & 8 & 5 & 9
\\end{array}\\right]
\`\`\`

with \`<Pointer to="r2" name="R2 − 2R1" />\` beside it.

### Rules the host checks

- Every id in one step is unique across elements, rows, items, nodes, edges and TeX anchors; prefix ids when two objects show the same thing (\`row-B\`, \`node-B\`).
- Every \`Arrow\`, \`Pointer\` and tag key names an id that exists in that step. Graph edges join known nodes. A \`Region\` names an \`Fn\` of its own Plot.
- Layers go only inside \`Plot\` or \`Diagram\`, as listed. \`Figure\` is returned once, outermost.
- Limits: 64 steps; 4,000 elements per step and 20,000 per figure; 2,000 characters per string and 512 KiB of text per figure; ids of 1 to 64 characters matching \`[A-Za-z0-9][A-Za-z0-9_.:-]*\`; Table 64 rows by 16 columns; 64 TeX anchors per step; Seq 128 items; Graph 128 nodes and 512 edges; Plot and Diagram 256 layers each, 2,000 points per layer, 256 points per shape; 8 parameters, 12 options each; Quiz 8 options; nesting depth 32; program source 64 KiB; 2 s of run time. A figure over a limit fails with the limit named.

### Example, to copy the form of and not its topic

\`\`\`figure
const shelf = [2, 5, 9, 12];   // books on a shelf
const returns = [7, 1, 10];    // returned books to place

export default function () {
  const steps = [{ shelf: [...shelf], text: 'The shelf before any returns.' }];
  let cur = [...shelf];
  for (const book of returns) {
    const at = cur.findIndex(b => b > book);
    const pos = at < 0 ? cur.length : at;
    cur = [...cur.slice(0, pos), book, ...cur.slice(pos)];
    steps.push({ shelf: [...cur], placed: book, pos, text: \`Book **\${book}** goes at position \${pos}, before the first larger number.\` });
  }
  return (
    <Figure steps={steps} caption={step => step.text} render={(step, i) => (
      <Row gap="lg" align="center">
        <Seq id="shelf" title="Shelf" index items={step.shelf.map(b => ({ id: \`b\${b}\`, label: b }))}
          tags={step.placed === undefined ? {} : { [\`b\${step.placed}\`]: 'new' }} />
        {step.placed !== undefined && <Pointer to={\`b\${step.placed}\`} name="placed" />}
        <Panel title="Returned">
          <Text>{\`\${i} of \${returns.length} placed\`}</Text>
        </Panel>
      </Row>
    )} />
  );
}
\`\`\``;
