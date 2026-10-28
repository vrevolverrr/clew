import type { ModelInfo, Options, Query, SDKMessage, SDKUserMessage, SlashCommand } from '@anthropic-ai/claude-agent-sdk';

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { ClaudeAgent, type ClaudeQuery } from '@/agents/claude/ClaudeAgent';
import { type AgentEvent, type AgentSessionOptions, type AgentTool, ConversationNotFoundError } from '@/agents/types';

import completedTurn from '../../../fixtures/claude/completed-turn.json';
import interruptedTurn from '../../../fixtures/claude/interrupted-turn.json';
import loggedOutTurn from '../../../fixtures/claude/logged-out-turn.json';
import supportedCommands from '../../../fixtures/claude/supported-commands.json';
import supportedModels from '../../../fixtures/claude/supported-models.json';
import toolTurn from '../../../fixtures/claude/tool-turn.json';

const SESSION: AgentSessionOptions = {
  systemPrompt: 'Reply with JSON Lines only.',
  model: 'haiku',
  effort: 'low',
  cwd: '/tmp/clew-test',
  cliPath: process.execPath,
};

interface ScriptedTurn {
  messages: SDKMessage[];
  /** Like the real CLI, keep the turn streaming until the session sends an interrupt. */
  runsUntilInterrupted?: boolean;
}

const completed: ScriptedTurn = { messages: completedTurn as SDKMessage[] };
const longRunning: ScriptedTurn = { messages: interruptedTurn as SDKMessage[], runsUntilInterrupted: true };
const loggedOut: ScriptedTurn = { messages: loggedOutTurn as SDKMessage[] };

/** Stands in for the SDK boundary: replays captured CLI output for each user message it receives. */
async function nextApproval(stream: AsyncIterator<AgentEvent>): Promise<Extract<AgentEvent, { type: 'approval' }>> {
  for (;;) {
    const { value, done } = await stream.next();
    if (done) throw new Error('The turn ended without an approval');
    if (value.type === 'approval') return value;
  }
}

class ScriptedQuery {
  readonly prompts: string[] = [];
  readonly contents: SDKUserMessage['message']['content'][] = [];
  options: Options | undefined;
  interrupts = 0;
  queries = 0;
  closed = false;
  readonly controls: object[] = [];
  /** Set to make the CLI refuse to start, as it does for a session it no longer has. */
  startError: Error | null = null;
  usage: { totalTokens: number; rawMaxTokens: number } | Error = { totalTokens: 84_000, rawMaxTokens: 200_000 };
  private onInterrupt: () => void = () => {};

  constructor(private readonly turns: ScriptedTurn[]) {}

  readonly query: ClaudeQuery = ({ prompt, options }) => {
    this.queries++;
    this.options = options;
    const self = this;
    async function* replay(): AsyncGenerator<SDKMessage, void> {
      const input = (prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]();
      for (const turn of self.turns) {
        const next = await input.next();
        if (next.done) return;
        self.prompts.push(String(next.value.message.content));
        self.contents.push(next.value.message.content);
        const interruptsBefore = self.interrupts;
        let waited = false;
        for (const message of turn.messages) {
          yield message;
          if (turn.runsUntilInterrupted && !waited && isTextDelta(message)) {
            waited = true;
            if (self.interrupts === interruptsBefore) {
              await new Promise<void>((resolve) => { self.onInterrupt = resolve; });
            }
          }
        }
      }
    }
    return Object.assign(replay(), {
      interrupt: async () => { this.interrupts++; this.onInterrupt(); return undefined; },
      close: () => { this.closed = true; },
      initializationResult: async () => { if (this.startError) throw this.startError; return {}; },
      getContextUsage: async () => { if (this.usage instanceof Error) throw this.usage; return this.usage; },
      supportedModels: async () => supportedModels as ModelInfo[],
      supportedCommands: async () => supportedCommands as SlashCommand[],
      setModel: async (model?: string) => { this.controls.push({ setModel: model }); },
      applyFlagSettings: async (settings: object) => { this.controls.push({ applyFlagSettings: settings }); },
    }) as unknown as Query;
  };
}

function isTextDelta(message: SDKMessage): boolean {
  return message.type === 'stream_event'
    && message.event.type === 'content_block_delta'
    && message.event.delta.type === 'text_delta';
}

function streamedText(turn: SDKMessage[]): string {
  return turn
    .filter(isTextDelta)
    .map((m) => (m as { event: { delta: { text: string } } }).event.delta.text)
    .join('');
}

async function collect(events: AsyncIterable<AgentEvent>, onEvent?: (event: AgentEvent) => void): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) {
    out.push(event);
    onEvent?.(event);
  }
  return out;
}

const textOf = (events: AgentEvent[]): string =>
  events.map((e) => (e.type === 'text' ? e.delta : '')).join('');

describe('ClaudeAgent session', () => {

  it('cancels a pending permission request when the session closes', async () => {
    const cli = new ScriptedQuery([longRunning]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);
    const stream = session.send('Edit the note')[Symbol.asyncIterator]();
    await stream.next();
    const pending = cli.options!.canUseTool!('Edit', { file_path: '/vault/note.md', old_string: 'before', new_string: 'after' }, {
      toolUseID: 'edit', requestId: 'request', signal: new AbortController().signal,
    });
    const approval = await nextApproval(stream);
    await session.close();
    expect(approval.signal.aborted).toBe(true);
    approval.answer(true);
    expect(await pending).toMatchObject({ behavior: 'deny', interrupt: true });
    await stream.return?.();
  });
  it('streams the assistant text once and completes the turn', async () => {
    const cli = new ScriptedQuery([completed]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    const events = await collect(session.send('Greet the student.'));

    expect(textOf(events)).toBe(streamedText(completed.messages));
    expect(textOf(events)).toContain('"type":"say"');
    expect(events.at(-1)).toEqual({ type: 'done', status: 'completed' });
  });

  it("reports the title Claude Code wrote for the session's conversation", async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'clew-claude-config-'));
    const previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = configDir;
    try {
      const session = await new ClaudeAgent(new ScriptedQuery([completed]).query).openSession(SESSION);
      expect(await session.title?.()).toBeUndefined();

      mkdirSync(path.join(configDir, 'projects', '-vault'), { recursive: true });
      writeFileSync(path.join(configDir, 'projects', '-vault', `${session.id}.jsonl`), JSON.stringify({ type: 'ai-title', aiTitle: 'Greeting the student' }));

      expect(await session.title?.()).toBe('Greeting the student');
    } finally {
      if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = previous;
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  it('sends an attached image as a base64 block ahead of the text', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'clew-claude-'));
    const file = path.join(dir, 'figure.png');
    writeFileSync(file, Buffer.from('not really a png'));
    const cli = new ScriptedQuery([completed, completed]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    try {
      await collect(session.send('What is this?', undefined, [{ path: file, mediaType: 'image/png' }]));
      await collect(session.send('And now?'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    expect(cli.contents[0]).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from('not really a png').toString('base64') } },
      { type: 'text', text: 'What is this?' },
    ]);
    expect(cli.contents[1]).toBe('And now?');
  });

  it('fails the turn when an attached image cannot be read, and takes the next one', async () => {
    const cli = new ScriptedQuery([completed]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    const events = await collect(session.send('What is this?', undefined, [{ path: '/no/such/figure.png', mediaType: 'image/png' }]));
    const next = await collect(session.send('Try again.'));

    expect(events.at(-1)).toMatchObject({ type: 'done', status: 'failed', error: expect.stringContaining('ENOENT') });
    expect(next.at(-1)).toEqual({ type: 'done', status: 'completed' });
  });

  it('reports context usage before the turn ends', async () => {
    const cli = new ScriptedQuery([completed]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    const events = await collect(session.send('Greet the student.'));

    expect(events.slice(-2)).toEqual([
      { type: 'usage', used: 84_000, window: 200_000 },
      { type: 'done', status: 'completed' },
    ]);
  });

  it('completes the turn without usage when the CLI cannot report it', async () => {
    const cli = new ScriptedQuery([completed]);
    cli.usage = new Error('unavailable');
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    const events = await collect(session.send('Greet the student.'));

    expect(events.some((e) => e.type === 'usage')).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'done', status: 'completed' });
  });

  it('reports each tool call as running, then done, before the text that follows it', async () => {
    const cli = new ScriptedQuery([{ messages: toolTurn as SDKMessage[] }]);
    const session = await new ClaudeAgent(cli.query).openSession({ ...SESSION, cwd: '/private/tmp/clew-capture' });

    const events = await collect(session.send('What does the pin count track?'));

    const id = 'toolu_01RHHNWxmCuxJs3J3jH9Lm2X';
    expect(events.filter((e) => e.type === 'tool')).toEqual([
      { type: 'tool', id, name: 'Read', title: 'Read notes.md', status: 'running' },
      { type: 'tool', id, name: 'Read', title: 'Read notes.md', status: 'done' },
    ]);
    expect(events.findIndex((e) => e.type === 'text')).toBeGreaterThan(events.findIndex((e) => e.type === 'tool' && e.status === 'done'));
    expect(textOf(events)).toBe(streamedText(toolTurn as SDKMessage[]));
    expect(events.at(-1)).toEqual({ type: 'done', status: 'completed' });
  });

  describe('with a tool of its own', () => {
    const loadPack: AgentTool = {
      name: 'load_pack',
      description: 'Get a pack.',
      argument: { name: 'name', values: ['plot'] },
      run: () => 'the pack',
      title: (name) => `Loaded the ${name} visuals`,
    };

    it('hands the CLI the tool and lets it run without asking', async () => {
      const cli = new ScriptedQuery([completed]);
      const server = { type: 'sdk', name: 'clew' };
      const offered: AgentTool[][] = [];
      const agent = new ClaudeAgent(cli.query, async (tools) => {
        offered.push(tools);
        return { mcpServers: { clew: server as never }, allowedTools: ['mcp__clew__load_pack'] };
      });

      await agent.openSession({ ...SESSION, tools: [loadPack] });

      expect(offered).toEqual([[loadPack]]);
      expect(cli.options?.mcpServers).toEqual({ clew: server });
      expect(cli.options?.allowedTools).toEqual(['mcp__clew__load_pack']);
    });

    it('starts no tool server for a session with no tools', async () => {
      const cli = new ScriptedQuery([completed]);
      const agent = new ClaudeAgent(cli.query, async () => { throw new Error('no server wanted'); });

      await agent.openSession(SESSION);

      expect(cli.options?.mcpServers).toBeUndefined();
      expect(cli.options?.allowedTools).toBeUndefined();
    });

    it("titles a call to it with the tool's own line", async () => {
      const messages = (toolTurn as SDKMessage[]).map((message) => {
        if (message.type !== 'assistant') return message;
        const content = (message.message.content as { type: string }[]).map((block) => (block.type === 'tool_use' ? { ...block, name: 'mcp__clew__load_pack', input: { name: 'plot' } } : block));
        return { ...message, message: { ...message.message, content } };
      }) as SDKMessage[];
      const cli = new ScriptedQuery([{ messages }]);
      const session = await new ClaudeAgent(cli.query, async () => ({})).openSession({ ...SESSION, tools: [loadPack] });

      const events = await collect(session.send('Plot sin x.'));

      expect(events.filter((e) => e.type === 'tool').map((e) => e.type === 'tool' && [e.name, e.title, e.status])).toEqual([
        ['load_pack', 'Loaded the plot visuals', 'running'],
        ['load_pack', 'Loaded the plot visuals', 'done'],
      ]);
    });
  });

  it('reports thinking when a tool-use or thinking block starts, before the text', async () => {
    const cli = new ScriptedQuery([{ messages: toolTurn as SDKMessage[] }]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    const events = await collect(session.send('What does the pin count track?'));

    const kinds = events.map((e) => (e.type === 'tool' ? `tool ${e.status}` : e.type));
    expect(kinds.filter((kind, i) => kind !== kinds[i - 1])).toEqual([
      'thinking', 'tool running', 'tool done', 'thinking', 'text', 'usage', 'done',
    ]);
  });

  it('keeps one CLI process across turns and sends each event as a user message', async () => {
    const cli = new ScriptedQuery([completed, completed]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    await collect(session.send('first event'));
    const second = await collect(session.send('second event'));

    expect(cli.queries).toBe(1);
    expect(cli.prompts).toEqual(['first event', 'second event']);
    expect(second.at(-1)).toEqual({ type: 'done', status: 'completed' });
  });

  it('inherits Claude Code settings and permissions and installs the approval relay', async () => {
    const cli = new ScriptedQuery([]);

    await new ClaudeAgent(cli.query).openSession(SESSION);

    const options = cli.options!;
    expect(options.settingSources).toBeUndefined();
    expect(options.strictMcpConfig).toBeUndefined();
    expect(options.extraArgs).toBeUndefined();
    expect(options.tools).toEqual({ type: 'preset', preset: 'claude_code' });
    expect(options.permissionMode).toBeUndefined();
    expect(options.allowDangerouslySkipPermissions).toBeUndefined();
    expect(options.canUseTool).toEqual(expect.any(Function));
    expect(options.persistSession).toBeUndefined();
    expect(options.systemPrompt).toEqual({ type: 'preset', preset: 'claude_code', append: SESSION.systemPrompt });
    expect(options.model).toBe('haiku');
    expect(options.effort).toBe('low');
    expect(options.cwd).toBe(SESSION.cwd);
    expect(options.pathToClaudeCodeExecutable).toBe(process.execPath);
  });

  it('adds the student\'s environment variables to the CLI process, over inherited ones and under PATH', async () => {
    const cli = new ScriptedQuery([]);
    let userEnv: Record<string, string> = { ANTHROPIC_API_KEY: 'sk-ant-test', HOME: '/custom-home', PATH: '/ignored' };
    const agent = new ClaudeAgent(cli.query, undefined, () => userEnv);

    await agent.openSession(SESSION);

    const env = cli.options!.env!;
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
    expect(env.HOME).toBe('/custom-home');
    expect(env.PATH).not.toBe('/ignored');

    userEnv = { ANTHROPIC_API_KEY: 'changed' };
    await agent.openSession(SESSION);
    expect(cli.options!.env!.ANTHROPIC_API_KEY).toBe('changed');
  });

  it('passes a permission override to the CLI as its native mode', async () => {
    const cli = new ScriptedQuery([]);
    await new ClaudeAgent(cli.query).openSession({ ...SESSION, permissionPolicy: 'bypass' });
    expect(cli.options!.permissionMode).toBe('bypassPermissions');
    expect(cli.options!.allowDangerouslySkipPermissions).toBe(true);
    expect(cli.options!.canUseTool).toBeUndefined();
  });

  it('cancels a pending permission request when its turn is stopped', async () => {
    const cli = new ScriptedQuery([longRunning]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);
    const controller = new AbortController();
    const stream = session.send('Edit the note', controller.signal)[Symbol.asyncIterator]();
    await stream.next();
    const pending = cli.options!.canUseTool!('Edit', {}, { toolUseID: 'edit-1', requestId: 'request-1', signal: new AbortController().signal });
    const approval = await nextApproval(stream);
    controller.abort();
    expect(approval.signal.aborted).toBe(true);
    expect(await pending).toMatchObject({ behavior: 'deny', interrupt: true });
    approval.answer(true);
    await stream.return?.(); await session.close();
  });

  it('runs the next turn after one was abandoned at an approval', async () => {
    // The read left pending at the approval is the one that gets the turn's result.
    const messages = interruptedTurn as SDKMessage[];
    const waitsThenEnds: ScriptedTurn = { messages: [messages.find(isTextDelta)!, messages.find((message) => message.type === 'result')!], runsUntilInterrupted: true };
    const cli = new ScriptedQuery([waitsThenEnds, completed]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);
    const stream = session.send('Edit the note')[Symbol.asyncIterator]();
    await stream.next();
    const pending = cli.options!.canUseTool!('Edit', {}, { toolUseID: 'edit-1', requestId: 'request-1', signal: new AbortController().signal });
    await nextApproval(stream);
    await stream.return?.();
    expect(await pending).toMatchObject({ behavior: 'deny' });
    const events = await collect(session.send('Next question'));
    expect(events.at(-1)).toMatchObject({ type: 'done', status: 'completed' });
    await session.close();
  });

  it('declines a permission request that arrives with no turn running', async () => {
    const cli = new ScriptedQuery([]);
    await new ClaudeAgent(cli.query).openSession(SESSION);
    expect(await cli.options!.canUseTool!('Edit', {}, { toolUseID: 'edit-1', requestId: 'request-1', signal: new AbortController().signal })).toMatchObject({ behavior: 'deny' });
  });

  it('starts a conversation under a fresh id that a later session can resume', async () => {
    const cli = new ScriptedQuery([]);

    const first = await new ClaudeAgent(cli.query).openSession(SESSION);

    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cli.options!.sessionId).toBe(first.id);
    expect(cli.options!.resume).toBeUndefined();

    const resumed = await new ClaudeAgent(cli.query).openSession({ ...SESSION, resume: first.id });

    expect(resumed.id).toBe(first.id);
    expect(cli.options!.resume).toBe(first.id);
    expect(cli.options!.sessionId).toBeUndefined();
  });

  it('rejects, and closes the process, when the CLI no longer has the session to resume', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'clew-claude-config-'));
    try {
      const cli = new ScriptedQuery([]);
      cli.startError = new Error('Claude Code process exited with code 1');

      const opened = new ClaudeAgent(cli.query, undefined, () => ({ CLAUDE_CONFIG_DIR: configDir })).openSession({ ...SESSION, resume: 'gone' });

      await expect(opened).rejects.toBeInstanceOf(ConversationNotFoundError);
      expect(cli.closed).toBe(true);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  it('reports any other resume failure as itself while the conversation is still on disk', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'clew-claude-config-'));
    try {
      mkdirSync(path.join(configDir, 'projects', '-vault'), { recursive: true });
      writeFileSync(path.join(configDir, 'projects', '-vault', 'kept.jsonl'), '{}');
      const cli = new ScriptedQuery([]);
      cli.startError = new Error('No conversation found with session ID: kept');

      const opened = new ClaudeAgent(cli.query, undefined, () => ({ CLAUDE_CONFIG_DIR: configDir })).openSession({ ...SESSION, resume: 'kept' });

      await expect(opened).rejects.toThrow('No conversation found');
      await expect(opened).rejects.not.toBeInstanceOf(ConversationNotFoundError);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });

  it('leaves model and effort to the CLI when the chat picks Auto', async () => {
    const cli = new ScriptedQuery([]);

    await new ClaudeAgent(cli.query).openSession({ ...SESSION, model: undefined, effort: undefined });

    expect(cli.options!.model).toBeUndefined();
    expect(cli.options!.effort).toBeUndefined();
  });

  it('switches model and effort on the open session, and back to the defaults', async () => {
    const cli = new ScriptedQuery([]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    await session.setModel('opus', 'xhigh');
    await session.setModel(undefined, undefined);

    expect(cli.controls).toEqual([
      { setModel: 'opus' }, { applyFlagSettings: { effortLevel: 'xhigh' } },
      { setModel: undefined }, { applyFlagSettings: { effortLevel: null } },
    ]);
    expect(cli.queries).toBe(1);
  });

  it('interrupts the turn when the caller aborts', async () => {
    const cli = new ScriptedQuery([longRunning]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);
    const controller = new AbortController();

    const events = await collect(session.send('Write ten lines.', controller.signal), (event) => {
      if (event.type === 'text') controller.abort();
    });

    expect(cli.interrupts).toBe(1);
    expect(events.at(-1)).toEqual({ type: 'done', status: 'interrupted' });
  });

  it('keeps a turn the caller stopped reading from leaking into the next turn', async () => {
    const cli = new ScriptedQuery([longRunning, completed]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);
    for await (const event of session.send('abandoned')) {
      if (event.type === 'text') break;
    }

    const next = await collect(session.send('next event'));

    expect(cli.interrupts).toBe(1);
    expect(textOf(next)).toBe(streamedText(completed.messages));
    expect(next.at(-1)).toEqual({ type: 'done', status: 'completed' });
  });

  it('fails the turn with the CLI\'s message when the user is logged out', async () => {
    const cli = new ScriptedQuery([loggedOut]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    const events = await collect(session.send('hello'));

    expect(events).toEqual([{ type: 'done', status: 'failed', error: 'Not logged in · Please run /login' }]);
  });

  it('fails the turn when the CLI exits before reporting a result', async () => {
    const cli = new ScriptedQuery([{ messages: completed.messages.filter((m) => m.type !== 'result') }]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    const events = await collect(session.send('hello'));

    expect(events.at(-1)).toMatchObject({ type: 'done', status: 'failed' });
  });

  it('rejects a second turn while one is running', async () => {
    const cli = new ScriptedQuery([longRunning]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);
    const first = session.send('first')[Symbol.asyncIterator]();
    await first.next();

    await expect(collect(session.send('second'))).rejects.toThrow('A turn is already running');
  });

  it('closes the CLI process with the session', async () => {
    const cli = new ScriptedQuery([]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    await session.close();

    expect(cli.closed).toBe(true);
  });
});

describe('ClaudeAgent skills', () => {
  it('lists the student\'s skills from the open session, without Claude Code\'s own, and starts no other process', async () => {
    const cli = new ScriptedQuery([]);
    const session = await new ClaudeAgent(cli.query).openSession(SESSION);

    expect(await session.skills()).toEqual([
      { name: 'zebra', description: 'Answer with a fixed word.', argumentHint: undefined },
      { name: 'outline', description: 'Outline a note.', argumentHint: '<note>' },
    ]);
    expect(cli.queries).toBe(1);
  });
});

describe('ClaudeAgent models', () => {
  it('lists each family once, on its latest version, with the default marked', async () => {
    const cli = new ScriptedQuery([]);

    const models = await new ClaudeAgent(cli.query).models(process.execPath);

    const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
    expect(models).toEqual([
      { id: 'opus', name: 'Opus', efforts, isDefault: false },
      { id: 'fable', name: 'Fable', efforts, isDefault: false },
      { id: 'sonnet', name: 'Sonnet', efforts, isDefault: true },
      { id: 'haiku', name: 'Haiku', efforts, isDefault: false },
    ]);
  });

  it('lists models from a process with no setting sources, then closes it', async () => {
    const cli = new ScriptedQuery([]);

    await new ClaudeAgent(cli.query).models(process.execPath);

    expect(cli.options!.settingSources).toEqual([]);
    expect(cli.options!.persistSession).toBe(false);
    expect(cli.closed).toBe(true);
  });
});

it('mentions a file by its quoted path, and carries one whose path holds a quote', () => {
  const agent = new ClaudeAgent();
  expect(agent.fileMention('/v/My Notes.md')).toBe('@"/v/My Notes.md"');
  expect(agent.fileMention('/v/say "hi".md')).toBeUndefined();
});

it('says what the CLI wrote to stderr when it exits mid-turn', async () => {
  const cli = new ScriptedQuery([{ messages: [] }]);
  const session = await new ClaudeAgent(cli.query).openSession(SESSION);
  const child = cli.options!.spawnClaudeCodeProcess!({
    command: process.execPath, args: ['-e', 'process.stderr.write("Error: invalid API key")'], cwd: process.cwd(), env: {}, signal: new AbortController().signal,
  }) as unknown as import('child_process').ChildProcess;
  await new Promise((resolve) => child.on('close', resolve));

  const events = await collect(session.send('Hi'));

  expect(events.at(-1)).toEqual({ type: 'done', status: 'failed', error: 'Claude Code exited before finishing the turn', detail: 'Error: invalid API key' });
});
