import { type AgentAdapter, type AgentSession, type AgentSessionOptions, ConversationNotFoundError } from '@/agents/types';
import { ChatSession } from '@/chat/ChatSession';

function fakeSession(id: string): AgentSession {
  return { id, send: jest.fn(), skills: async () => [], setModel: async () => undefined, close: async () => undefined } as unknown as AgentSession;
}

function setup(openSession: (options: AgentSessionOptions) => Promise<AgentSession>, toolsOnResume = true) {
  const adapter = { openSession: jest.fn(openSession), toolsOnResume } as unknown as AgentAdapter & { openSession: jest.Mock };
  return { adapter, choice: () => ({ model: 'sonnet' }) };
}

describe('ChatSession', () => {
  it('opens a session for its own agent with the saved model and permission policy, and resumes the conversation it was given', async () => {
    const { adapter, choice } = setup(async () => fakeSession('s1'));

    await new ChatSession(adapter, choice, { cwd: '/vault', resume: 's1', permissionPolicy: 'approval' }).open();

    expect(adapter.openSession).toHaveBeenCalledTimes(1);
    expect(adapter.openSession.mock.calls[0]![0]).toMatchObject({ cwd: '/vault', model: 'sonnet', resume: 's1', permissionPolicy: 'approval' });
  });

  it('names the system prompt it opened with, and a prompt without the pack tool has another name', async () => {
    const { adapter, choice } = setup(async () => fakeSession('s1'), false);
    const fresh = new ChatSession(adapter, choice, { cwd: '/vault' });
    const resumed = new ChatSession(adapter, choice, { cwd: '/vault', resume: 's1' });
    expect(fresh.promptId).toBeUndefined();

    await fresh.open();
    await resumed.open();

    const [first, second] = adapter.openSession.mock.calls.map(([options]) => options as AgentSessionOptions);
    expect(fresh.promptId).toMatch(/^[0-9a-f]{8}$/);
    expect(first!.systemPrompt).not.toBe(second!.systemPrompt);
    expect(resumed.promptId).not.toBe(fresh.promptId);
    const again = new ChatSession(adapter, choice, { cwd: '/vault' });
    await again.open();
    expect(again.promptId).toBe(fresh.promptId);
  });

  it('starts a new conversation and tells the chat when the old one cannot be resumed', async () => {
    const { adapter, choice } = setup(async ({ resume }) => {
      if (resume) throw new ConversationNotFoundError(resume, new Error('gone'));
      return fakeSession('fresh');
    });
    const onLost = jest.fn();

    const session = await new ChatSession(adapter, choice, { cwd: '/vault', resume: 'gone', onLost }).open();

    expect(session.id).toBe('fresh');
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(adapter.openSession).toHaveBeenCalledTimes(2);
  });

  it('reports an agent that cannot open at all as an error, not as a lost conversation', async () => {
    const { adapter, choice } = setup(async () => { throw new Error('CLI not found'); });
    const onLost = jest.fn();

    await expect(new ChatSession(adapter, choice, { cwd: '/vault', resume: 'gone', onLost }).open()).rejects.toThrow('CLI not found');

    expect(adapter.openSession).toHaveBeenCalledTimes(1);
    expect(onLost).not.toHaveBeenCalled();
  });

  it('opens one session no matter how many callers ask', async () => {
    const { adapter, choice } = setup(async () => fakeSession('s1'));
    const chat = new ChatSession(adapter, choice, { cwd: '/vault' });

    await Promise.all([chat.open(), chat.open()]);

    expect(adapter.openSession).toHaveBeenCalledTimes(1);
  });

  describe('the pack tool', () => {
    const named = (prompt: string) => prompt.includes('call the load_pack tool');

    it('is offered to a new conversation, with a prompt that points at it', async () => {
      const { adapter, choice } = setup(async () => fakeSession('s1'), false);

      await new ChatSession(adapter, choice, { cwd: '/vault' }).open();

      const options = adapter.openSession.mock.calls[0]![0] as AgentSessionOptions;
      expect(options.tools?.map((tool) => tool.name)).toEqual(['load_pack']);
      expect(named(options.systemPrompt)).toBe(true);
    });

    it('is offered again to a resumed conversation of an agent that can add tools to it', async () => {
      const { adapter, choice } = setup(async () => fakeSession('s1'), true);

      await new ChatSession(adapter, choice, { cwd: '/vault', resume: 's1' }).open();

      const options = adapter.openSession.mock.calls[0]![0] as AgentSessionOptions;
      expect(options.tools?.map((tool) => tool.name)).toEqual(['load_pack']);
      expect(named(options.systemPrompt)).toBe(true);
    });

    it('is left out of a resumed conversation of an agent that cannot, whose prompt then lists every component', async () => {
      const { adapter, choice } = setup(async () => fakeSession('s1'), false);

      await new ChatSession(adapter, choice, { cwd: '/vault', resume: 's1' }).open();

      const options = adapter.openSession.mock.calls[0]![0] as AgentSessionOptions;
      expect(options.tools).toEqual([]);
      expect(named(options.systemPrompt)).toBe(false);
    });
  });
});
