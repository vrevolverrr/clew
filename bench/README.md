# Benchmarks

Measurement scripts for Clew. Nothing here is bundled into the plugin. Every run that calls a model goes through your own installed agent CLI and its login, so it is billed to your own subscription.

## Figure bench (`figure/`)

Two parts that stress-test figures from both ends: what models write, and how the renderer draws it.

**Bench B, the figure eval** asks each case in `cases.ts` as a real Clew chat turn (about fifty visuals across maths, physics, statistics, business, accounting and engineering). It checks which visual the reply chose, that each figure runs and validates, and that a 3D case draws a 3D `Plot`. Every reply is saved to `fixtures/generated/<model>/<case>.md`, where Bench A picks it up.

```bash
npm run eval:figures -- --models=haiku,luna [--only=text] [--repeat=1]
```

**Bench A, the layout bench** builds the plugin into a throwaway vault, opens it in a second Obsidian window through the Obsidian CLI, and plays each fixture through the chat. At each pane width and theme it measures every sampled step and both ends of every slider, then checks for overlapping, clipped and overflowing text, tiny text, low contrast, `NaN` in SVG, error cards and height jumps between steps. 3D `Plot`s are also checked from their geometry without a window (paint order, ticks and overlays in the frame), and for frame times while turning, at full speed and on a CPU slowed 4×.

```bash
npm run bench:figures -- [--source=stress,demo,generated] [--only=text] [--widths=320,480,720] [--themes=light,dark] [--update] [--keep]
```

It needs Obsidian running with its command line interface on (Settings → General → Command line interface). The bench window takes focus while it runs. Results go to promptfoo (`npx promptfoo view`: a row per fixture, a column per theme and width, a metric per check) and to `out/<time>/`: `contact.html` shows every shot of each fixture side by side, and `report.json` has every measured state.

| Path | Contents |
| --- | --- |
| `fixtures/stress/*.jsx` | Hand-written figure programs at the edges of the contract, one per file |
| `fixtures/generated/<model>/*.md` | Model replies saved by Bench B |
| `golden/<source>/*.json` | Text geometry of every state that passed, rounded to 2 px; a later run reports what moved. `--update` rewrites them |
| `cases.ts` | Bench B cases |
| `checks.ts`, `scene3Checks.ts` | Layout checks in the window, and 3D geometry checks without one |
| `runProgram.ts` | Runs a figure program outside the window, for Bench B and the 3D geometry checks |
| `page.ts` | Runs inside the bench window: plays a fixture, measures it, turns its 3D plots |
| `benchVault.ts`, `obsidianCli.ts` | The throwaway vault and the Obsidian CLI calls |

The demo fixtures are the figures of Clew's scripted demos (`src/chat/obsidian/playVisualsDemo.ts`, `playLayoutDemo.ts`).

Figure programs are code a model wrote, so outside the window each runs in its own Node process with no environment variables and Node's permission model on (`--permission`): it cannot read or write files or start processes. Node 22 does not restrict the network. Inside the window, programs run in Clew's own sandboxed worker, as in the plugin. Review changes to `fixtures/` as you would review code.

## Latency bench (`latency/`)

Drives the Claude Code CLI through the Agent SDK in several configurations and records spawn time, time to first token, time to the first page action, turn time, tokens and cost. It measures the live-tutor prototype, which acts on a page through tools (`highlight`, `annotate`, `draw_svg`, `scroll_to`, `say`).

```bash
npm run bench -- [--smoke] [--only=<config>] [--out=<file>]
node bench/latency/summarize.mjs bench/latency/results/results-full.json
node bench/latency/replay.mjs bench/latency/results/results-full.json <config> > replay.html
```

Results are written to `latency/results/`, which is not committed.
