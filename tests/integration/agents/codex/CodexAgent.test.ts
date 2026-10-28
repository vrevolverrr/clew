import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { CodexAgent } from '@/agents/codex/CodexAgent';
import { type AgentEvent, type AgentSession, type AgentSessionOptions, ConversationNotFoundError } from '@/agents/types';

const FAKE_CODEX = path.join(__dirname, '../../../fixtures/codex/fakeCodex.mjs');

interface LoggedMessage {
  id?: string | number;
  result?: Record<string, unknown>;
  method?: string;
  params?: Record<string, unknown>;
  event?: string;
}

let workDir: string;
let logPath: string;
let session: AgentSession | null;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'clew-codex-'));
  logPath = path.join(workDir, 'received.jsonl');
  process.env.FAKE_CODEX_LOG = logPath;
  session = null;
});

afterEach(async () => {
  await session?.close();
  delete process.env.FAKE_CODEX_LOG;
  delete process.env.FAKE_CODEX_SCENARIO;
  delete process.env.FAKE_CODEX_LOGGED_IN;
  delete process.env.FAKE_CODEX_STARTUP_ERROR;
  delete process.env.FAKE_CODEX_DEFAULT_MODEL;
  delete process.env.FAKE_CODEX_CONFIG_EFFORT;
  rmSync(workDir, { recursive: true, force: true });
});

function options(): AgentSessionOptions {
  return { systemPrompt: 'You are a live tutor.', model: 'gpt-6-luna', effort: 'low', cwd: workDir, cliPath: FAKE_CODEX };
}

async function open(scenario: string, overrides: Partial<AgentSessionOptions> = {}): Promise<AgentSession> {
  process.env.FAKE_CODEX_SCENARIO = scenario;
  session = await new CodexAgent().openSession({ ...options(), ...overrides });
  return session;
}

function received(): LoggedMessage[] {
  return readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as LoggedMessage);
}

function paramsOf(method: string): Record<string, unknown> | undefined {
  return received().find((message) => message.method === method)?.params;
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

const MESSAGE = '{"type":"say","text":"Look at the definition first."}';

describe('CodexAgent session', () => {
  it.each([undefined, 'thread-1'])('registers nonempty dynamic tools only for a fresh thread (resume=%s)', async (resume) => {
    const tool = { name: 'lookup', description: 'Look up a pack', argument: { name: 'name', values: ['plot'] }, run: (name: string) => name, title: (name: string) => name };
    await open('stream', { resume, tools: [tool] });
    if (resume) {
      expect(paramsOf('thread/start')).toEqual({ cwd: workDir, ephemeral: true });
      expect(paramsOf('thread/resume')).not.toHaveProperty('dynamicTools');
    } else {
      expect(paramsOf('thread/start')).toMatchObject({ dynamicTools: [{
        type: 'function', name: 'lookup', description: 'Look up a pack',
        inputSchema: { type: 'object', properties: { name: { type: 'string', enum: ['plot'] } }, required: ['name'], additionalProperties: false },
      }] });
    }
  });

  it('opens a saved thread inheriting native permission settings', async () => {
    await open('stream');

    const thread = paramsOf('thread/start');
    expect(paramsOf('initialize')).toMatchObject({ clientInfo: { name: 'clew' } });
    expect(received().some((message) => message.method === 'initialized')).toBe(true);
    expect(thread).toMatchObject({
      model: 'gpt-6-luna',
      cwd: workDir,
      developerInstructions: 'You are a live tutor.',
    });
    expect(thread).not.toHaveProperty('baseInstructions');
    expect(thread).not.toHaveProperty('sandbox');
    expect(thread).not.toHaveProperty('approvalPolicy');
    expect(thread).not.toHaveProperty('ephemeral');
    expect(session!.id).toBe('thread-1');
  });

  it('resumes an earlier thread under the same rules and runs a turn on it', async () => {
    const tutor = await open('stream', { resume: 'thread-1' });

    expect(paramsOf('thread/start')).toEqual({ cwd: workDir, ephemeral: true });
    expect(paramsOf('thread/resume')).toMatchObject({
      threadId: 'thread-1',
      model: 'gpt-6-luna',
      cwd: workDir,
      developerInstructions: 'You are a live tutor.',
      excludeTurns: true,
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
    });
    expect(tutor.id).toBe('thread-1');
    expect(textOf(await collect(tutor.send('Welcome back.')))).toBe(MESSAGE);
    expect(paramsOf('turn/start')).toMatchObject({ sandboxPolicy: { type: 'readOnly', networkAccess: false } });
  });

  it('reports a lost conversation when Codex can neither resume nor read the thread', async () => {
    await expect(open('stream', { resume: 'thread-gone' })).rejects.toBeInstanceOf(ConversationNotFoundError);
  });

  it('reports a failed resume as itself when Codex can still read the thread', async () => {
    const opened = open('resume-broken', { resume: 'thread-gone' });
    await expect(opened).rejects.toThrow('no rollout found');
    await expect(opened).rejects.not.toBeInstanceOf(ConversationNotFoundError);
  });

  it('reports the context size of the thread against the window, skipping updates without a window', async () => {
    const tutor = await open('usage');

    const events = await collect(tutor.send('Hello'));

    expect(events.filter((e) => e.type === 'usage')).toEqual([{ type: 'usage', used: 31000, window: 258400 }]);
  });

  it('keeps the new turn when a resumed thread replays the usage of an earlier turn', async () => {
    const tutor = await open('usage-replay', { resume: 'thread-1' });

    const events = await collect(tutor.send('Hello'));

    expect(textOf(events)).toBe(MESSAGE);
    expect(events.at(-1)).toEqual({ type: 'done', status: 'completed' });
  });

  it('streams the agent message once and completes the turn', async () => {
    const tutor = await open('stream');

    const events = await collect(tutor.send('Student opened the page.'));

    expect(textOf(events)).toBe(MESSAGE);
    expect(events.at(-1)).toEqual({ type: 'done', status: 'completed' });
  });

  it('sends attached images as local files ahead of the text', async () => {
    const tutor = await open('stream');

    await collect(tutor.send('What is this?', undefined, [{ path: '/vault/figure.png', mediaType: 'image/png' }]));
    await collect(tutor.send('And now?'));

    const inputs = received().filter((message) => message.method === 'turn/start').map((message) => message.params!.input);
    expect(inputs[0]).toEqual([{ type: 'localImage', path: '/vault/figure.png' }, { type: 'text', text: 'What is this?', text_elements: [] }]);
    expect(inputs[1]).toEqual([{ type: 'text', text: 'And now?', text_elements: [] }]);
  });

  it('starts each turn with the session model and effort', async () => {
    const tutor = await open('stream');

    await collect(tutor.send('Student opened the page.'));

    expect(paramsOf('turn/start')).toMatchObject({
      threadId: 'thread-1',
      model: 'gpt-6-luna',
      effort: 'low',
      input: [{ type: 'text', text: 'Student opened the page.' }],
    });
  });

  it('leaves model and effort to Codex when the chat picks Auto', async () => {
    const tutor = await open('stream', { model: undefined, effort: undefined });

    await collect(tutor.send('Student opened the page.'));

    expect(paramsOf('thread/start')).not.toHaveProperty('model');
    expect(paramsOf('turn/start')).not.toHaveProperty('model');
    expect(paramsOf('turn/start')).not.toHaveProperty('effort');
  });

  it('reports reasoning, then tool items, between messages and starts each message as a new paragraph', async () => {
    const tutor = await open('tools');

    const events = await collect(tutor.send('What does the pin count track?'));

    expect(events).toEqual([
      { type: 'text', delta: 'Let me check the note.' },
      { type: 'thinking' },
      { type: 'tool', id: 'cmd-1', name: 'Read', title: 'Read notes.md', status: 'running' },
      { type: 'tool', id: 'cmd-1', name: 'Read', title: 'Read notes.md', status: 'done' },
      { type: 'tool', id: 'patch-1', name: 'Edit', title: 'Edited notes.md', status: 'running' },
      { type: 'tool', id: 'patch-1', name: 'Edit', title: 'Edited notes.md', status: 'failed' },
      { type: 'text', delta: '\n\nIt tracks active users.' },
      { type: 'text', delta: '\n\nWant an example?' },
      { type: 'done', status: 'completed' },
    ]);
  });

  it('emits completed message text that never streamed as deltas', async () => {
    const tutor = await open('completion-only');

    const events = await collect(tutor.send('Student opened the page.'));

    expect(textOf(events)).toBe(MESSAGE);
  });

  it('keeps one app-server across turns', async () => {
    const tutor = await open('stream');

    await collect(tutor.send('first event'));
    const second = await collect(tutor.send('second event'));

    const methods = received().map((message) => message.method);
    expect(methods.filter((method) => method === 'initialize')).toHaveLength(1);
    expect(methods.filter((method) => method === 'turn/start')).toHaveLength(2);
    expect(textOf(second)).toBe(MESSAGE);
  });

  it('fails the turn with Codex\'s message when the usage limit is hit', async () => {
    const tutor = await open('usage-limit');

    const events = await collect(tutor.send('Student opened the page.'));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'done', status: 'failed' });
    expect((events[0] as { error?: string }).error).toContain('hit your usage limit');
  });

  it('interrupts the turn when the caller aborts', async () => {
    const tutor = await open('long');
    const controller = new AbortController();

    const events = await collect(tutor.send('Write ten lines.', controller.signal), (event) => {
      if (event.type === 'text') controller.abort();
    });

    expect(paramsOf('turn/interrupt')).toEqual({ threadId: 'thread-1', turnId: 'turn-1' });
    expect(events.at(-1)).toEqual({ type: 'done', status: 'interrupted' });
  });

  it('keeps a turn the caller stopped reading from leaking into the next turn', async () => {
    const tutor = await open('long,stream');
    for await (const event of tutor.send('abandoned')) {
      if (event.type === 'text') break;
    }

    const next = await collect(tutor.send('next event'));

    expect(paramsOf('turn/interrupt')).toEqual({ threadId: 'thread-1', turnId: 'turn-1' });
    expect(textOf(next)).toBe(MESSAGE);
    expect(next.at(-1)).toEqual({ type: 'done', status: 'completed' });
  });

  it('fails the turn when the app-server exits mid-turn', async () => {
    const tutor = await open('exit');

    const events = await collect(tutor.send('Student opened the page.'));

    expect(events.at(-1)).toEqual({ type: 'done', status: 'failed', error: 'Codex exited before finishing the turn', detail: 'thread panicked at core/src/codex.rs' });
  });

  it('rejects a second turn while one is running', async () => {
    const tutor = await open('long');
    const first = tutor.send('first')[Symbol.asyncIterator]();
    await first.next();

    await expect(collect(tutor.send('second'))).rejects.toThrow('A turn is already running');
    await first.return?.();
  });

  it('shuts the app-server down when the session closes', async () => {
    const tutor = await open('stream');

    await tutor.close();
    session = null;

    expect(received().some((message) => message.event === 'terminated')).toBe(true);
  });
});

describe('CodexAgent permission relay', () => {

  it.each(['approvalPolicy', 'approvalsReviewer', 'sandbox'])('rejects resumed Inherit with missing %s and shuts down', async (field) => {
    await expect(open('inherit-missing-' + field, { resume: 'thread-1', permissionPolicy: 'inherit' }))
      .rejects.toThrow('did not report its native permission defaults');
    expect(received().some((message) => message.method === 'thread/resume')).toBe(false);
    expect(received()).toContainEqual({ event: 'terminated' });
  });

  it.each(['close', 'exit'] as const)('cancels a pending approval on %s without accepting a late answer', async (end) => {
    const tutor = await open(end === 'exit' ? 'approval-exit' : 'approval-command');
    let approval: Extract<AgentEvent, { type: 'approval' }> | undefined;
    let closing: Promise<void> | undefined;
    const events = await collect(tutor.send('Do the action'), (event) => {
      if (event.type === 'approval') {
        approval = event;
        if (end === 'close') closing = tutor.close();
      }
    });
    await closing;
    expect(approval).toBeDefined();
    expect(approval!.request.fields).toContainEqual({ kind: 'command', value: 'echo hello' });
    expect(approval!.signal.aborted).toBe(true);
    approval!.answer(true);
    expect(events.at(-1)).toMatchObject({ type: 'done', status: 'failed' });
    expect(received().filter((message) => message.id === 'approval-turn-1').some((message) => message.result?.decision === 'accept')).toBe(false);
  });
  type Approval = Extract<AgentEvent, { type: 'approval' }>;
  const approvalsIn = (events: AgentEvent[]): Approval[] => events.filter((event): event is Approval => event.type === 'approval');

  it.each([
    ['approval-command', true], ['approval-command', false],
    ['approval-file', true], ['approval-file', false],
    ['approval-permissions', true], ['approval-permissions', false],
  ])('streams %s as an approval event and returns approval=%s on the original RPC request', async (scenario, approved) => {
    const tutor = await open(String(scenario));
    const events = await collect(tutor.send('Do the action'), (event) => { if (event.type === 'approval') event.answer(approved); });
    const approvals = approvalsIn(events);
    expect(approvals).toHaveLength(1);
    const response = received().find((message) => message.id === 'approval-turn-1');
    expect(response?.result).toEqual(scenario === 'approval-permissions'
      ? { permissions: approved ? { network: { enabled: true }, fileSystem: { write: ['/outside'] } } : {}, scope: 'turn' }
      : { decision: approved ? 'accept' : 'decline' });
    if (scenario === 'approval-file') expect((approvals[0]!.request.input.item as { changes: { diff: string }[] }).changes[0]!.diff).toContain('+after');
    expect(events.at(-1)).toEqual({ type: 'done', status: 'completed' });
  });

  it('declines a request from another thread without asking', async () => {
    const tutor = await open('approval-stale');
    const events = await collect(tutor.send('Do the action'));
    expect(approvalsIn(events)).toHaveLength(0);
    expect(received().find((message) => message.id === 'approval-turn-1')?.result).toEqual({ decision: 'decline' });
  });

  it('withdraws a native-resolved prompt even when nobody answers it', async () => {
    const tutor = await open('approval-resolved');
    const events = await collect(tutor.send('Do the action'));
    const approvals = approvalsIn(events);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.signal.aborted).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'done', status: 'completed' });
  });

  it('interrupts a pending approval without accepting a late answer', async () => {
    const tutor = await open('approval-command');
    const controller = new AbortController();
    let approval: Approval | undefined;
    const events = await collect(tutor.send('Do the action', controller.signal), (event) => {
      if (event.type === 'approval') { approval = event; controller.abort(); }
    });
    approval!.answer(true);
    expect(events.at(-1)).toEqual({ type: 'done', status: 'interrupted' });
    expect(received().filter((message) => message.id === 'approval-turn-1').every((message) => message.result?.decision !== 'accept')).toBe(true);
  });

  it('passes a permission override to the thread as native approval and sandbox settings', async () => {
    await open('stream', { permissionPolicy: 'bypass' });
    expect(paramsOf('thread/start')).toMatchObject({ approvalPolicy: 'never', approvalsReviewer: 'user', sandbox: 'danger-full-access' });
  });

  it('reports unavailable automatic review instead of silently using manual approval', async () => {
    await expect(open('auto-unsupported', { permissionPolicy: 'auto' })).rejects.toThrow('did not enable automatic approval review');
  });
});

describe('CodexAgent skills', () => {
  it('lists the enabled skills of the student for the session folder with their short descriptions', async () => {
    const tutor = await open('stream');

    expect(await tutor.skills()).toEqual([
      { name: 'zebra', description: 'Answer with a fixed word.' },
      { name: 'outline', description: 'Outline a note' },
    ]);
    expect(paramsOf('skills/list')).toEqual({ cwds: [workDir] });
  });
});

describe('CodexAgent models', () => {
  it('lists each family once, on its latest version, across every page', async () => {
    const models = await new CodexAgent().models(FAKE_CODEX);

    const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
    expect(models).toEqual([
      { id: 'gpt-6.1-sol', name: 'Sol', efforts: [...efforts, 'ultra'], isDefault: true },
      { id: 'gpt-6-astra', name: 'Astra', efforts: [...efforts, 'ultra'], isDefault: false },
      { id: 'gpt-6-luna', name: 'Luna', efforts, isDefault: false },
    ]);
  });

  it('sends the chosen model and effort on the next turn, and the defaults once switched back', async () => {
    const turnStarts = (): Record<string, unknown>[] =>
      received().filter((message) => message.method === 'turn/start').map((message) => message.params!);
    const codex = await open('stream');

    await codex.setModel('gpt-6-astra', 'high');
    await collect(codex.send('first'));
    await codex.setModel(undefined, undefined);
    await collect(codex.send('second'));

    expect(turnStarts().map(({ model, effort }) => ({ model, effort }))).toEqual([
      { model: 'gpt-6-astra', effort: 'high' },
      { model: 'gpt-6.1-sol', effort: 'low' },
    ]);
  });

  it('resolves Auto through the config model and effort even when the session opened with a model', async () => {
    process.env.FAKE_CODEX_DEFAULT_MODEL = 'gpt-6-luna';
    process.env.FAKE_CODEX_CONFIG_EFFORT = 'high';
    const codex = await open('stream', { model: 'gpt-6-astra' });

    await codex.setModel();
    await collect(codex.send('first'));

    const turn = received().filter((message) => message.method === 'turn/start').at(-1)!.params!;
    expect({ model: turn.model, effort: turn.effort }).toEqual({ model: 'gpt-6-luna', effort: 'high' });
  });

  it('retries a failed native catalogue request and caches the successful result', async () => {
    const codex = await open('models-retry');
    await expect(codex.setModel('gpt-6-astra')).rejects.toThrow('Model listing temporarily unavailable');
    await codex.setModel('gpt-6-astra');
    await codex.setModel('gpt-6-luna');
    expect(received().filter((message) => message.method === 'model/list').map((message) => message.params?.cursor)).toEqual([null, null, '1']);
  });

  it('keeps opening defaults independent for two sessions of one provider', async () => {
    process.env.FAKE_CODEX_SCENARIO = 'stream';
    let nativeDefault = 'gpt-6-astra';
    const agent = new CodexAgent(() => ({ FAKE_CODEX_DEFAULT_MODEL: nativeDefault }));
    const first = await agent.openSession({ ...options(), model: undefined, effort: undefined });
    let second: AgentSession | undefined;
    try {
      nativeDefault = 'gpt-6-luna';
      second = await agent.openSession({ ...options(), model: undefined, effort: undefined });
      await first.setModel();
      await second.setModel();
      await collect(first.send('First conversation'));
      await collect(second.send('Second conversation'));
      expect(received().filter((message) => message.method === 'turn/start').map((message) => ({
        model: message.params?.model, effort: message.params?.effort,
      }))).toEqual([
        { model: 'gpt-6-astra', effort: 'low' },
        { model: 'gpt-6-luna', effort: 'medium' },
      ]);
    } finally {
      await second?.close();
      await first.close();
    }
  });
});

describe('CodexAgent auth state', () => {
  it('reports logged-in when `codex login status` succeeds', async () => {
    process.env.FAKE_CODEX_LOGGED_IN = '1';

    await expect(new CodexAgent().authState(FAKE_CODEX)).resolves.toBe('logged-in');
  });

  it('reports logged-out when `codex login status` fails', async () => {
    process.env.FAKE_CODEX_LOGGED_IN = '0';

    await expect(new CodexAgent().authState(FAKE_CODEX)).resolves.toBe('logged-out');
  });
});

it('says what Codex wrote to stderr when it fails to start', async () => {
  process.env.FAKE_CODEX_STARTUP_ERROR = 'failed to load configuration: ~/.codex/config.toml: unknown variant priority';
  await expect(new CodexAgent().openSession(options())).rejects.toThrow('Codex exited\n\nfailed to load configuration: ~/.codex/config.toml: unknown variant priority');
});
