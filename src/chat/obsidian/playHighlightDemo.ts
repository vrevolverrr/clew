import { type App, normalizePath, Notice, type TFile } from 'obsidian';

import type { AgentEvent, AgentSession } from '@/agents/types';

const FOLDER = 'Clew demo';
const FIRST = `${FOLDER}/Optics.md`;
const SECOND = `${FOLDER}/Waves.md`;
const CHUNK = 24;
const CHUNK_MS = 20;

function filler(topic: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `Paragraph ${i + 1} on ${topic}. It holds nothing the walk-through points at, and only makes the note long enough to scroll.\n`).join('\n');
}

const NOTES: Record<string, string> = {
  [FIRST]: `# Optics

Sunlight meets air. **Rayleigh scattering** sends short wavelengths in every direction, and blue light is scattered far more than red.
It's the reason the sky looks blue by day.

${filler('light', 14)}
## Sunsets

- Sunsets look red because the light crosses more air.
- Clouds look white because their drops scatter every color alike.

The scattered intensity falls as $I \\propto \\lambda^{-4}$, so halving the wavelength
makes the scattering sixteen times stronger.

${filler('colour', 14)}
## Refraction

Light bends at a boundary. The slope of the bend depends on the two indices.

The slope here is steeper than it looks.

| Medium | Index |
| --- | --- |
| Air | 1.00 |
| Water | 1.33 |

See [[Waves]] for how a wave changes speed across the boundary.
`,
  [SECOND]: `# Waves

A wave carries energy without carrying matter.

${filler('waves', 10)}
## Speed at a boundary

Frequency stays the same across a boundary, so the wavelength must change when the speed does.
This is why light bends.

${filler('speed', 8)}
`,
};

const SLOPE_LINE = NOTES[FIRST]!.split('\n').findIndex((line) => line.startsWith('The slope here')) + 1;

// The reply an agent would write: prose with stops between it, a quote with marks it does not show, a line number for
// a repeated phrase, a second note, a quote that is not there, and text far below the first screen.
const REPLY = `Let me walk you through it.

Sunlight meets air, and what scatters depends on the wavelength:

@Highlight("Rayleigh scattering sends short wavelengths in every direction", "Why the sky is blue")
Blue light scatters far more than red, so the sky is blue by day.
@Highlight("It’s the reason the sky looks blue by day", "Curly quote here, straight in the note")
@Highlight("this phrase is not in the note", "Not there: this stop shows as missed")

The strength of the scattering changes quickly with wavelength:

@Highlight("makes the scattering sixteen times stronger", "Hard-wrapped across two lines")
@Highlight("Paragraph 12 on light", "Far below the first screen")

The same words can appear twice, so a line number picks one:

@Highlight("The slope", "Appears twice; the line number picks one", "${FIRST}", ${SLOPE_LINE})

Finally, waves in the other note explain why light bends:

@Highlight("Frequency stays the same across a boundary", "Another note, opened in a tab", "${SECOND}")

That is the whole tour. Click any stop above to see it again.
`;

/** The chat a demo plays its scripted reply in. */
export interface DemoChat {
  playTurn(message: string, session: AgentSession, notePath: string): Promise<void>;
}

/** A session that writes `reply` as an agent would, in small pieces, so the demo needs no model. */
export function scriptedSession(reply: string): AgentSession {
  return {
    id: 'demo',
    async *send(): AsyncGenerator<AgentEvent> {
      for (let at = 0; at < reply.length; at += CHUNK) {
        yield { type: 'text', delta: reply.slice(at, at + CHUNK) };
        await new Promise((resolve) => window.setTimeout(resolve, CHUNK_MS));
      }
      yield { type: 'done', status: 'completed' };
    },
    skills: async () => [],
    setModel: async () => undefined,
    close: async () => undefined,
  };
}

/**
 * Writes two sample notes, opens one, and plays a scripted reply in a new chat through the path an agent's reply
 * takes, so the cursor, the cards and the walkthrough in the chat can be tried without a model.
 */
export async function playHighlightDemo(app: App, openChat: () => Promise<DemoChat | null>): Promise<void> {
  const files: TFile[] = [];
  for (const [path, content] of Object.entries(NOTES)) {
    files.push(app.vault.getFileByPath(path) ?? (await create(app, path, content)));
  }
  await app.workspace.getLeaf('tab').openFile(files[0]!, { active: true });
  const chat = await openChat();
  if (!chat) return;
  new Notice('Highlight demo: Optics.md and Waves.md. Hover a card to hold it; Esc, or scrolling or typing in the note, stops it.');
  await chat.playTurn('Walk me through Optics.', scriptedSession(REPLY), FIRST);
}

async function create(app: App, path: string, content: string): Promise<TFile> {
  const folder = normalizePath(FOLDER);
  if (!app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
  return app.vault.create(normalizePath(path), content);
}
