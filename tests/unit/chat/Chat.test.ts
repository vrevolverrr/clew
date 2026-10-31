import { AsyncQueue } from '@/agents/shared/AsyncQueue';
import type { AgentAdapter, AgentEvent, AgentSession, AgentSessionOptions, ModelOption } from '@/agents/types';
import type { ChatContext } from '@/context/ChatContext';
import { ChatDefaults } from '@/chat/ChatDefaults';
import { Chat, type ChatEvents } from '@/chat/Chat';
import type { ChatRecord } from '@/chat/ChatRecord';
import { ChatStore } from '@/chat/ChatStore';
import type { TurnView } from '@/chat/runTurn';

type FakeSession = AgentSession & { options: AgentSessionOptions; events: AsyncQueue<AgentEvent>; input: string[] };

const ID = '00000000-0000-4000-8000-000000000001';
const option = (id: string, name: string): ModelOption => ({ id, name }) as ModelOption;
const settle = async (): Promise<void> => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

const view: TurnView = {
  sent: () => undefined, appendText: () => undefined, tool: () => undefined, thinking: () => undefined, usage: () => undefined,
  approve: async () => false, ask: async () => undefined, act: () => undefined, finish: () => undefined,
};

function setup(record: Partial<ChatRecord> = {}, title?: string, claudeModels: Promise<ModelOption[]> = Promise.resolve([]), savedDefaults: unknown = {}) {
  const sessions: FakeSession[] = [];
  const adapter = (id: 'claude' | 'codex'): AgentAdapter => ({
    id, skillSyntax: { prefix: id === 'claude' ? '/' : '$', atStart: id === 'claude' }, fileMention: (path) => `@"${path}"`, toolsOnResume: true,
    authState: async () => 'logged-in', models: async () => [],
    openSession: async (options) => {
      const events = new AsyncQueue<AgentEvent>();
      const session: FakeSession = {
        id: `${id}-${sessions.length}`, options, events, input: [],
        async *send(text: string) { session.input.push(text); yield* events; },
        ...(title ? { title: async () => title } : {}),
        skills: async () => [], setModel: jest.fn(async () => undefined), close: jest.fn(async () => undefined),
      } as FakeSession;
      sessions.push(session);
      return session;
    },
  });
  const defaults = new ChatDefaults(savedDefaults, async () => undefined);
  const disk = new Map<string, string>();
  const store = new ChatStore({
    read: async (path) => disk.get(path) ?? null,
    write: async (path, text) => { disk.set(path, text); },
    list: async () => [...disk.keys()],
    remove: async (path) => { disk.delete(path); },
  });
  const events: { [K in keyof ChatEvents]: jest.Mock } = { changed: jest.fn(), switched: jest.fn(), lost: jest.fn(), notice: jest.fn(), warn: jest.fn() };
  const chat = new Chat({ id: ID, agent: 'claude', title: '', updatedAt: 0, turns: [], ...record }, {
    defaults, agents: { claude: adapter('claude'), codex: adapter('codex') }, models: { claude: claudeModels, codex: Promise.resolve([]) }, store, cwd: '/vault',
  }, events);
  const finish = (session: FakeSession) => { session.events.push({ type: 'text', delta: 'Because.' }); session.events.push({ type: 'done', status: 'completed' }); session.events.close(); };
  return { chat, defaults, sessions, store, events, finish };
}

const context: ChatContext = { message: 'Why is the sky blue?', attachments: [] };

describe('Chat', () => {
  it('sends the context as the turn text, saves the turn, resolves with it, and titles the first one from its message', async () => {
    const { chat, sessions, store, finish } = setup();
    chat.open(); await settle();
    const sending = chat.send({ ...context, note: { path: 'optics.md' } }, view);
    await settle();
    expect(sessions[0]!.input[0]).toContain('<note path="optics.md"/>');
    finish(sessions[0]!);
    const turn = await sending;
    const saved = await store.load(ID);
    expect(saved?.turns).toHaveLength(1);
    expect(turn).toEqual(saved?.turns[0]);
    expect(turn?.prompt).toMatch(/^[0-9a-f]{8}$/);
    expect(saved?.title).toBe('Why is the sky blue?');
    expect(saved?.sessionId).toBe('claude-0');
  });

  it('takes the title the agent gave the conversation', async () => {
    const { chat, sessions, store, finish } = setup({}, 'Rayleigh scattering');
    chat.open(); await settle();
    const sending = chat.send(context, view);
    await settle(); finish(sessions[0]!); await sending;
    expect((await store.load(ID))?.title).toBe('Rayleigh scattering');
  });

  it('ignores a second message while a turn runs, resolving it with no turn', async () => {
    const { chat, sessions, finish } = setup();
    chat.open(); await settle();
    const first = chat.send(context, view);
    await settle();
    expect(chat.busy).toBe(true);
    expect(await chat.send({ ...context, message: 'And at sunset?' }, view)).toBeUndefined();
    finish(sessions[0]!);
    expect((await first)?.status).toBe('completed');
    expect(sessions[0]!.input).toHaveLength(1);
    expect(chat.busy).toBe(false);
  });

  it('applies a permission change after the running turn, resuming the same conversation', async () => {
    const { chat, sessions, store, finish } = setup();
    chat.open(); await settle();
    const sending = chat.send(context, view);
    await settle();
    await chat.choosePermission('approval');
    expect(sessions).toHaveLength(1);
    finish(sessions[0]!); await sending; await settle();
    expect(sessions).toHaveLength(2);
    expect(sessions[1]!.options).toMatchObject({ resume: 'claude-0', permissionPolicy: 'approval' });
    expect((await store.load(ID))?.permissionPolicy).toBe('approval');
  });

  it('replaces the session after a failed turn, resuming the same conversation', async () => {
    const { chat, sessions } = setup();
    chat.open(); await settle();
    const sending = chat.send(context, view);
    await settle();
    sessions[0]!.events.push({ type: 'done', status: 'failed', error: 'Claude Code exited before finishing the turn' });
    sessions[0]!.events.close();
    await sending; await settle();
    expect(sessions).toHaveLength(2);
    expect(sessions[1]!.options).toMatchObject({ resume: 'claude-0' });
    expect(sessions[0]!.close).toHaveBeenCalledTimes(1);
  });

  it('does not save an empty chat when its policy changes', async () => {
    const { chat, sessions, store } = setup();
    chat.open(); await settle();
    const save = jest.spyOn(store, 'save');
    await chat.choosePermission('bypass');
    expect(save).not.toHaveBeenCalled();
    expect(sessions.at(-1)!.options.permissionPolicy).toBe('bypass');
  });

  it('moves to another agent without the old conversation', async () => {
    const { chat, sessions, events } = setup({ sessionId: 'old' });
    chat.open(); await settle();
    await chat.choose('codex', {});
    expect(chat.agent).toBe('codex');
    expect(chat.record).toMatchObject({ agent: 'codex', sessionId: undefined });
    expect(events.switched).toHaveBeenCalledTimes(1);
    expect(sessions.at(-1)!.options.resume).toBeUndefined();
    expect(sessions[0]!.close).toHaveBeenCalledTimes(1);
  });

  it('saves an agent switch of a chat with turns, and not of an empty one', async () => {
    const turn = { message: 'q', parts: [], status: 'completed' as const };
    const kept = setup({ sessionId: 'old', turns: [turn] });
    kept.chat.open(); await settle();
    await kept.chat.choose('codex', {});
    expect(await kept.store.load(ID)).toMatchObject({ agent: 'codex', sessionId: undefined, choice: {} });

    const empty = setup();
    empty.chat.open(); await settle();
    const save = jest.spyOn(empty.store, 'save');
    await empty.chat.choose('codex', {});
    expect(save).not.toHaveBeenCalled();
  });

  it('saves a model choice of a chat with turns', async () => {
    const { chat, store } = setup({ turns: [{ message: 'q', parts: [], status: 'completed' }] });
    chat.open(); await settle();
    await chat.choose('claude', { model: 'opus' });
    expect((await store.load(ID))?.choice).toEqual({ model: 'opus' });
  });

  it('records no prompt id on a scripted turn', async () => {
    const { chat, sessions } = setup();
    chat.open(); await settle();
    const scripted = { id: 'demo', send: async function* () { yield { type: 'done', status: 'completed' } as AgentEvent; } } as unknown as AgentSession;
    await chat.play(context, scripted, view);
    await settle();
    expect(sessions).toHaveLength(1);
    expect(chat.record.turns[0]!.prompt).toBeUndefined();
  });

  it('applies a model choice to the open session when the agent stays', async () => {
    const { chat, sessions, events } = setup();
    chat.open(); await settle();
    await chat.choose('claude', { model: 'opus' });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.setModel).toHaveBeenCalledWith('opus', undefined);
    expect(chat.choice('claude')).toEqual({ model: 'opus' });
    expect(events.switched).not.toHaveBeenCalled();
  });

  it('refuses to switch agents during a turn', async () => {
    const { chat, sessions, events, finish } = setup();
    chat.open(); await settle();
    const sending = chat.send(context, view);
    await settle();
    await chat.choose('codex', {});
    expect(events.warn).toHaveBeenCalledWith('Stop the current reply before switching agents.');
    expect(chat.agent).toBe('claude');
    finish(sessions[0]!); await sending;
  });

  it('saves a rating on its turn', async () => {
    const { chat, sessions, store, finish } = setup();
    chat.open(); await settle();
    const sending = chat.send(context, view);
    await settle(); finish(sessions[0]!); await sending;
    await chat.rate(0, 'up');
    expect((await store.load(ID))?.turns[0]?.rating).toBe('up');
    await chat.rate(5, 'down');
    expect((await store.load(ID))?.turns).toHaveLength(1);
  });

  describe('model upgrade', () => {
    const models = [option('sonnet-5-5', 'Sonnet')];

    it('moves a saved model to the newest version of its family, and the default with it when the default held the same model', async () => {
      const saved = { choices: { claude: { model: 'sonnet-4', name: 'Sonnet' } } };
      const { chat, defaults, sessions } = setup({}, undefined, Promise.resolve(models), saved);
      chat.open(); await settle();
      expect(chat.choice('claude')).toEqual({ model: 'sonnet-5-5', name: 'Sonnet' });
      expect(defaults.choice('claude')).toEqual({ model: 'sonnet-5-5', name: 'Sonnet' });
      expect(sessions[0]!.setModel).toHaveBeenCalledWith('sonnet-5-5', undefined);
    });

    it('leaves the default alone when it holds another model', async () => {
      const saved = { choices: { claude: { model: 'opus-5', name: 'Opus' } } };
      const { chat, defaults } = setup({ choice: { model: 'sonnet-4', name: 'Sonnet' } }, undefined, Promise.resolve(models), saved);
      chat.open(); await settle();
      expect(chat.choice('claude')).toEqual({ model: 'sonnet-5-5', name: 'Sonnet' });
      expect(defaults.choice('claude')).toEqual({ model: 'opus-5', name: 'Opus' });
    });

    it.each([
      ['is already the newest', { model: 'sonnet-5-5', name: 'Sonnet' }],
      ['has no family the CLI lists', { model: 'x', name: 'Other' }],
      ['was never set', undefined],
    ])('leaves a choice that %s', async (_name, choice) => {
      const { chat, sessions } = setup({ choice }, undefined, Promise.resolve(models));
      chat.open(); await settle();
      expect(chat.choice('claude')).toEqual(choice ?? {});
      expect(sessions[0]!.setModel).not.toHaveBeenCalled();
    });

    it('lets a pick made while the list loaded win', async () => {
      let list!: (options: ModelOption[]) => void;
      const { chat } = setup({ choice: { model: 'sonnet-4', name: 'Sonnet' } }, undefined, new Promise((resolve) => { list = resolve; }));
      chat.open(); await settle();
      await chat.choose('claude', { model: 'sonnet-4', name: 'Sonnet', effort: 'high' });
      list(models); await settle();
      expect(chat.choice('claude')).toEqual({ model: 'sonnet-4', name: 'Sonnet', effort: 'high' });
    });
  });
});
