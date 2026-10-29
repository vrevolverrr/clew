// Drives the developer's installed CLIs against their own subscriptions: npm run test:live
// Runs under tsx and node:test because the Claude SDK is ESM-only and jest cannot load it.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';

import '../setupWindow';

import { createAgents } from '../../src/agents/providers';
import type { AgentAdapter, AgentEvent, AgentSessionOptions, AgentTool } from '../../src/agents/types';
import { buildTurn } from '../../src/context/buildTurn';
import { readTexts, turnFiles } from '../../src/context/ChatAttachment';
import { findQuote } from '../../src/tour/locateQuote';
import { runTurn } from '../../src/chat/runTurn';
import { buildSystemPrompt } from '../../src/context/systemPrompt';
import { splitReply } from '../../src/chat/splitReply';
import { validateFigure } from '../../src/renderer/figure/validateFigure';
import { buildFigureWorker } from '../../scripts/buildFigureWorker.js';
import { runFigureWorker } from '../runFigureWorker';

const SYSTEM_PROMPT = 'You are a live tutor. Reply with JSON Lines only: one {"type":"say","text":"..."} object per line, no prose, no code fences.';
const adapters = createAgents(() => ({}));
const AGENTS: Array<{ agent: AgentAdapter; model: string }> = [
  { agent: adapters.claude, model: process.env.CLEW_LIVE_CLAUDE_MODEL ?? 'haiku' },
  { agent: adapters.codex, model: process.env.CLEW_LIVE_CODEX_MODEL ?? 'gpt-6-luna' },
];
const only = process.env.CLEW_LIVE_AGENT;
// Per test: a suite-wide limit grows wrong as tests are added.
const LIMIT = { timeout: 120_000 };

// Clew supplies no tool today; the contract still carries them, so a stub checks the wiring.
const stubTool: AgentTool = { name: 'load_pack', description: 'Loads a pack by name.', argument: { name: 'name', values: ['plot'] }, run: () => 'ok', title: (name) => `Loaded ${name}` };

let cwd: string;

/** A solid-color PNG, so a model's answer shows whether it saw the image. */
function solidPng(size: number, [r, g, b]: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const frame = Buffer.alloc(8 + body.length);
    frame.writeUInt32BE(data.length, 0);
    body.copy(frame, 4);
    frame.writeUInt32BE(crc32(body), 4 + body.length);
    return frame;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array(size).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

before(() => {
  // Obsidian is never launched from a Claude Code session; drop that session's markers.
  for (const key of Object.keys(process.env)) {
    if (/^CLAUDE(CODE$|_CODE_ENTRYPOINT$|_CODE_SESSION|_CODE_CHILD|_CODE_MESSAGING|_CODE_BRIDGE|_PID$)/.test(key)) delete process.env[key];
  }
  cwd = mkdtempSync(path.join(tmpdir(), 'clew-live-'));
  writeFileSync(path.join(cwd, 'notes.md'), 'The pin count tracks active users of a page.\n');
  writeFileSync(path.join(cwd, 'optics.md'), '# Optics\n\nSunlight meets air. **Rayleigh scattering** sends short wavelengths in every direction, and blue light is scattered far more than red.\n\n- Sunsets look red because the light crosses more air.\n- Clouds look white because their drops scatter every color alike.\n');
  writeFileSync(path.join(cwd, 'swatch.png'), solidPng(64, [0, 0, 255]));
  for (const dir of ['.claude', '.agents']) {
    mkdirSync(path.join(cwd, dir, 'skills', 'zebra'), { recursive: true });
    writeFileSync(
      path.join(cwd, dir, 'skills', 'zebra', 'SKILL.md'),
      '---\nname: zebra\ndescription: Answer with a fixed word.\n---\nWhen this skill runs, reply with exactly the word PINEAPPLE and nothing else.\n',
    );
  }
});

after(() => rmSync(cwd, { recursive: true, force: true }));

async function collect(events: AsyncIterable<AgentEvent>, onEvent?: (event: AgentEvent) => void): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) {
    out.push(event);
    onEvent?.(event);
  }
  return out;
}

for (const { agent, model } of AGENTS.filter(({ agent }) => !only || agent.id === only)) {
  describe(`${agent.id} against the installed CLI`, () => {
    // Functional fixtures retain their former full-access behavior; the permission test overrides it explicitly.
    const options = (): AgentSessionOptions => ({ systemPrompt: SYSTEM_PROMPT, model, effort: 'low', cwd, permissionPolicy: 'bypass' });

    it('is signed in', LIMIT, async () => {
      assert.equal(await agent.authState(), 'logged-in');
    });

    it('relays a native permission prompt and honors decline and approve', LIMIT, async () => {
      const directory = mkdtempSync(path.join(process.cwd(), '.context', 'permission-live-'));
      const permissionCwd = mkdtempSync(path.join(tmpdir(), 'clew-permission-cwd-'));
      const target = path.join(directory, 'permission.txt');
      mkdirSync(path.join(permissionCwd, '.claude'));
      const settingsPath = path.join(permissionCwd, '.claude', 'settings.local.json');
      // Force a native Claude prompt without changing the developer's own settings.
      writeFileSync(settingsPath, JSON.stringify({ permissions: { ask: ['Bash', 'Write', 'Edit'] } }), { flag: 'wx' });
      writeFileSync(target, '', { flag: 'wx' });
      try {
        for (const approved of [false, true]) {
          let prompts = 0;
          const session = await agent.openSession({
            ...options(), cwd: permissionCwd, permissionPolicy: 'approval',
            systemPrompt: 'You are testing permission handling. Perform only the requested file operation. If permission is denied, stop immediately; do not retry or use another tool. Reply briefly.',
          });
          try {
            const instruction = agent.id === 'codex'
              ? `Run exec_command with sandbox_permissions="require_escalated" and a justification to execute: printf 'approved' >> '${target}'. Request approval explicitly.`
              : `Use Bash to execute exactly: printf 'approved' >> '${target}'.`;
            const events = await collect(session.send(instruction, AbortSignal.timeout(60_000)), (event) => {
              if (event.type === 'approval') { prompts++; event.answer(approved); }
            });
            assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
            assert.ok(prompts > 0, 'The CLI did not send a permission request');
            assert.equal(readFileSync(target, 'utf8'), approved ? 'approved' : '');
          } finally { await session.close(); }
        }
      } finally {
        rmSync(permissionCwd, { recursive: true, force: true });
        rmSync(directory, { recursive: true, force: true });
      }
    });

    it('lists its models, one default, and switches to one mid-session', LIMIT, async () => {
      const models = await agent.models();
      assert.equal(models.filter((option) => option.isDefault).length, 1, JSON.stringify(models));
      assert.ok(models.some((option) => option.id === model), JSON.stringify(models));

      const session = await agent.openSession({ ...options(), model: undefined, effort: undefined });
      try {
        await session.setModel(model, 'low');
        const events = await collect(session.send('Student opened the page. Greet them with one say line.'));
        assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
      } finally {
        await session.close();
      }
    });

    it('streams a completed turn, then a second turn on the same session', LIMIT, async () => {
      const session = await agent.openSession(options());
      try {
        const first = await collect(session.send('Student opened the page. Greet them with one say line.'));
        const second = await collect(session.send('Student asked: what is a derivative? One say line.'));

        for (const turn of [first, second]) {
          assert.deepEqual(turn.at(-1), { type: 'done', status: 'completed' });
          assert.match(turn.map((e) => (e.type === 'text' ? e.delta : '')).join(''), /"type"/);
        }
      } finally {
        await session.close();
      }
    });

    it('reports a tool call it makes as running, then done', LIMIT, async () => {
      const session = await agent.openSession(options());
      try {
        const events = await collect(session.send('Read the file notes.md in the working directory with a tool, then reply with one say line quoting it.'));
        const tools = events.filter((e) => e.type === 'tool');

        assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
        assert.ok(tools.some((e) => e.status === 'running'), JSON.stringify(tools));
        assert.ok(tools.some((e) => e.status === 'done' && /notes\.md/.test(e.title)), JSON.stringify(tools));
      } finally {
        await session.close();
      }
    });

    it('sees an image attached to a turn', LIMIT, async () => {
      const session = await agent.openSession(options());
      try {
        const events = await collect(session.send('What single color fills the attached image? Reply with one say line naming it.', undefined, [{ path: path.join(cwd, 'swatch.png'), mediaType: 'image/png' }]));

        assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
        assert.match(events.map((e) => (e.type === 'text' ? e.delta : '')).join(''), /blue/i);
      } finally {
        await session.close();
      }
    });

    it('has the text of an attached file with no tool call, however its CLI loads it', LIMIT, async () => {
      const outside = mkdtempSync(path.join(tmpdir(), 'clew-mention-'));
      const file = path.join(outside, 'My Handout.txt');
      writeFileSync(file, 'The secret word is MARMALADE.\n');
      const files = turnFiles([{ kind: 'file', path: file, name: 'My Handout.txt' }], cwd, agent.fileMention);
      const text = buildTurn({
        message: 'What is the secret word in the attached file? Do not use any tool.',
        skillSyntax: agent.skillSyntax,
        files,
        fileTexts: await readTexts(files.filter(({ mention }) => mention === undefined).map(({ path }) => path)),
      });
      const session = await agent.openSession({ ...options(), systemPrompt: buildSystemPrompt() });
      try {
        const events = await collect(session.send(text));

        assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
        assert.match(events.map((e) => (e.type === 'text' ? e.delta : '')).join(''), /MARMALADE/i);
        assert.deepEqual(events.filter((e) => e.type === 'tool'), []);
      } finally {
        await session.close();
        rmSync(outside, { recursive: true, force: true });
      }
    });

    it('reads a file outside the working folder that a turn names by full path', LIMIT, async () => {
      const outside = mkdtempSync(path.join(tmpdir(), 'clew-outside-'));
      const file = path.join(outside, 'handout.txt');
      writeFileSync(file, 'The secret word is MARMALADE.\n');
      const session = await agent.openSession({ ...options(), systemPrompt: buildSystemPrompt() });
      try {
        const events = await collect(session.send(`<attachment path="${file}"/>\n\nWhat is the secret word in the attached file?`));

        assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
        assert.match(events.map((e) => (e.type === 'text' ? e.delta : '')).join(''), /MARMALADE/i);
      } finally {
        await session.close();
        rmSync(outside, { recursive: true, force: true });
      }
    });

    it('titles a new chat from its own CLI, or from a @Title line that never reaches the transcript', LIMIT, async () => {
      const session = await agent.openSession({ ...options(), systemPrompt: buildSystemPrompt() });
      try {
        const turn = await runTurn(
          async () => session,
          { context: { message: 'Why is the sky blue?', attachments: [] }, root: cwd, text: 'Why is the sky blue?', signal: new AbortController().signal, wantTitle: true },
          { sent: () => undefined, appendText: () => undefined, tool: () => undefined, thinking: () => undefined, usage: () => undefined, approve: async () => false, ask: async () => undefined, act: () => undefined, finish: () => undefined },
        );

        assert.equal(turn.turn.status, 'completed');
        assert.doesNotMatch(JSON.stringify(turn.turn.parts), /@Title/);
        assert.ok(turn.title, `no title; reply: ${JSON.stringify(turn.turn.parts)}`);
      } finally {
        await session.close();
      }
    });

    it('points at text of the open note with a @Highlight line that the note holds', LIMIT, async () => {
      const content = readFileSync(path.join(cwd, 'optics.md'), 'utf8');
      const session = await agent.openSession({ ...options(), systemPrompt: buildSystemPrompt() });
      const marked: string[] = [];
      try {
        const turn = await runTurn(
          async () => session,
          {
            context: { message: 'Why is the sky blue? Point at the sentence in my note that explains it.', attachments: [], note: { path: 'optics.md' } },
            root: cwd,
            text: buildTurn({ message: 'Why is the sky blue? Point at the sentence in my note that explains it.', skillSyntax: agent.skillSyntax, note: { path: 'optics.md' } }),
            signal: new AbortController().signal,
          },
          { sent: () => undefined, appendText: () => undefined, tool: () => undefined, thinking: () => undefined, usage: () => undefined, approve: async () => false, ask: async () => undefined, act: (step) => marked.push(step.quote), finish: () => undefined },
        );

        assert.equal(turn.turn.status, 'completed');
        assert.doesNotMatch(JSON.stringify(turn.turn.parts), /@Highlight/);
        assert.ok(marked.length > 0, `no highlight; reply: ${JSON.stringify(turn.turn.parts)}`);
        for (const quote of marked) assert.ok(findQuote(content, quote), `not in the note: ${quote}`);
      } finally {
        await session.close();
      }
    });

    it('runs a Clew tool the agent calls and reports it done', LIMIT, async () => {
      const session = await agent.openSession({ ...options(), tools: [stubTool] });
      try {
        const events = await collect(session.send(`Call the ${stubTool.name} tool with the plot pack, then reply with one say line.`));
        const tools = events.filter((e) => e.type === 'tool' && e.name === stubTool.name);

        assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
        assert.ok(tools.some((e) => e.type === 'tool' && e.status === 'done'), JSON.stringify(tools));
      } finally {
        await session.close();
      }
    });

    it('writes a figure that runs, and a Quiz whose answer is one of its options', LIMIT, async () => {
      const session = await agent.openSession({ ...options(), systemPrompt: buildSystemPrompt() });
      const worker = buildFigureWorker();
      const figureOf = async (message: string) => {
        const events = await collect(session.send(message));
        const text = events.map((e) => (e.type === 'text' ? e.delta : '')).join('');
        const fence = splitReply(text, true).find((segment) => segment.kind === 'figure');
        assert.ok(fence, `no figure fence; reply: ${text}`);
        const result = validateFigure(await runFigureWorker(worker, { kind: 'run', source: fence.text, params: {} }));
        assert.ok(result.ok, `${result.ok ? '' : result.error}\n${fence.text}`);
        return result.figure;
      };
      try {
        const dijkstra = await figureOf('Show Dijkstra\'s algorithm on a weighted graph of five nodes as a figure, step by step.');
        assert.ok(dijkstra.steps.length > 1);
        const quiz = await figureOf('Check my understanding of derivatives with one Quiz figure, and nothing else.');
        assert.ok(JSON.stringify(quiz.steps[0].root).includes('"type":"Quiz"'), JSON.stringify(quiz.steps[0].root));
      } finally {
        await session.close();
      }
    });

    it('lists the skills in the working folder and runs one typed with the agent\'s prefix', LIMIT, async () => {
      const session = await agent.openSession(options());
      try {
        const skills = await session.skills();
        const events = await collect(session.send(`${agent.skillSyntax.prefix}zebra go`));

        assert.ok(skills.some((skill) => skill.name === 'zebra' && skill.description.startsWith('Answer with a fixed word.')), JSON.stringify(skills));
        assert.match(events.map((e) => (e.type === 'text' ? e.delta : '')).join(''), /PINEAPPLE/);
      } finally {
        await session.close();
      }
    });

    it('remembers the conversation in a later session that resumes it', LIMIT, async () => {
      const first = await agent.openSession(options());
      let id: string;
      try {
        id = first.id;
        await collect(first.send('Remember the secret word MANGO. Reply with one say line.'));
      } finally {
        await first.close();
      }

      const second = await agent.openSession({ ...options(), resume: id });
      try {
        assert.equal(second.id, id);
        const events = await collect(second.send('What was the secret word? One say line.'));
        assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
        assert.match(events.map((e) => (e.type === 'text' ? e.delta : '')).join(''), /MANGO/);
      } finally {
        await second.close();
      }
    });

    it('rejects at open when asked to resume an id it never saw', LIMIT, async () => {
      await assert.rejects(agent.openSession({ ...options(), resume: '00000000-0000-4000-8000-000000000000' }), /no (conversation|rollout) found/i);
    });

    it('interrupts a long turn when aborted', LIMIT, async () => {
      const session = await agent.openSession(options());
      const controller = new AbortController();
      try {
        const events = await collect(
          session.send('Write forty say lines, each a long sentence about calculus.', controller.signal),
          (event) => { if (event.type === 'text') controller.abort(); },
        );

        assert.deepEqual(events.at(-1), { type: 'done', status: 'interrupted' });
      } finally {
        await session.close();
      }
    });
  });
}
