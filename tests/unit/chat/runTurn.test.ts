import type { AgentEvent, AgentSession } from '@/agents/types';
import type { ChatContext } from '@/context/ChatContext';
import { runTurn, type TurnView } from '@/chat/runTurn';

function sessionOf(events: AgentEvent[] | (() => AsyncGenerator<AgentEvent>), id = 's1'): AgentSession {
  const send = typeof events === 'function' ? events : async function* () { yield* events; };
  return { id, send } as unknown as AgentSession;
}

function viewOf(approved = false): TurnView & { calls: string[]; sent: jest.Mock } {
  const calls: string[] = [];
  return {
    calls,
    sent: jest.fn(),
    approve: async (request) => { calls.push(`approve:${request.description}`); return approved; },
    appendText: (delta) => calls.push(`text:${delta}`),
    tool: (part) => calls.push(`tool:${part.id}`),
    thinking: () => calls.push('thinking'),
    usage: (used, window) => calls.push(`usage:${used}/${window}`),
    act: (step) => calls.push(`act:${step.path}:${step.quote}`),
    finish: (turn) => calls.push(`finish:${turn.status}`),
  };
}

const context: ChatContext = { message: 'Why?', attachments: [] };
const request = { context, root: '/vault', text: '<note/>\nWhy?', signal: new AbortController().signal };

describe('runTurn', () => {
  it('logs a failure\'s detail but saves only its short error', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const events: AgentEvent[] = [{ type: 'done', status: 'failed', error: 'Codex exited before finishing the turn', detail: 'thread panicked' }];

    const { turn } = await runTurn(async () => sessionOf(events), request, viewOf());

    expect(turn).toMatchObject({ status: 'failed', error: 'Codex exited before finishing the turn' });
    expect(JSON.stringify(turn)).not.toContain('thread panicked');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('thread panicked'));
    log.mockRestore();
  });

  it('draws each event as it arrives and returns the recorded turn with the new session id', async () => {
    const view = viewOf();
    const events: AgentEvent[] = [
      { type: 'thinking' },
      { type: 'text', delta: 'Scat' },
      { type: 'text', delta: 'tering.' },
      { type: 'usage', used: 10, window: 100 },
      { type: 'done', status: 'completed' },
    ];

    const result = await runTurn(async () => sessionOf(events, 'new'), { ...request, sessionId: 'old' }, view);

    expect(view.calls).toEqual(['thinking', 'text:Scat', 'text:tering.', 'usage:10/100', 'finish:completed']);
    expect(result.sessionId).toBe('new');
    expect(result.turn).toMatchObject({ message: 'Why?', status: 'completed', parts: [{ type: 'text', text: 'Scattering.' }] });
  });

  it('asks the view about an approval, hands the agent the answer, and keeps streaming without recording it', async () => {
    const view = viewOf(true);
    const answer = jest.fn();
    const events: AgentEvent[] = [
      { type: 'approval', request: { description: 'this command', input: { command: 'ls' }, fields: [{ kind: 'command', value: 'ls' }], changes: [] }, signal: new AbortController().signal, answer },
      { type: 'text', delta: 'Listed.' },
      { type: 'done', status: 'completed' },
    ];

    const { turn } = await runTurn(async () => sessionOf(events), request, view);

    expect(view.calls).toEqual(['approve:this command', 'text:Listed.', 'finish:completed']);
    expect(answer).toHaveBeenCalledWith(true);
    expect(turn.parts).toEqual([{ type: 'text', text: 'Listed.' }]);
  });

  it('keeps the quote on the turn and tells the caller once the session has the turn', async () => {
    const view = viewOf();
    const quote = { text: 'Rayleigh', path: 'optics.md' };
    const selection = { ...quote, key: 'Rayleigh' };

    const { turn } = await runTurn(async () => sessionOf([{ type: 'done', status: 'completed' }]), { ...request, context: { ...context, selection } }, view);

    expect(turn.quote).toEqual(quote);
    expect(view.sent).toHaveBeenCalledTimes(1);
  });

  it('records the attachments on the turn and hands the agent the images as files', async () => {
    const send = jest.fn(async function* () { yield { type: 'done', status: 'completed' } as AgentEvent; });
    const attachments = [
      { kind: 'file' as const, path: '/Users/me/week1.pdf', name: 'week1.pdf' },
      { kind: 'image' as const, path: 'attachments/c/a.png', mediaType: 'image/png' as const, name: 'image.png' },
    ];

    const { turn } = await runTurn(async () => ({ id: 's1', send }) as unknown as AgentSession, { ...request, context: { ...context, attachments } }, viewOf());

    expect(turn.attachments).toEqual(attachments);
    expect(send).toHaveBeenCalledWith(request.text, request.signal, [{ path: '/vault/attachments/c/a.png', mediaType: 'image/png' }]);
  });

  it('ends a session that cannot open as a failed turn and keeps the earlier session id', async () => {
    const view = viewOf();

    const result = await runTurn(async () => { throw new Error('CLI not found'); }, { ...request, sessionId: 'old' }, view);

    expect(result.turn).toMatchObject({ status: 'failed', error: 'CLI not found' });
    expect(result.sessionId).toBe('old');
    expect(view.calls).toEqual(['finish:failed']);
    expect(view.sent).not.toHaveBeenCalled();
  });

  it('ends a stream that throws as a failed turn that keeps the text so far', async () => {
    const view = viewOf();
    const stream = async function* (): AsyncGenerator<AgentEvent> {
      yield { type: 'text', delta: 'Half' };
      throw new Error('connection lost');
    };

    const { turn } = await runTurn(async () => sessionOf(stream), request, view);

    expect(turn).toMatchObject({ status: 'failed', error: 'connection lost', parts: [{ type: 'text', text: 'Half' }] });
    expect(view.calls).toEqual(['text:Half', 'finish:failed']);
  });

  it('has no title when the agent offers none or fails to read it, and the turn still completes', async () => {
    const events: AgentEvent[] = [{ type: 'done', status: 'completed' }];
    const failing = { ...sessionOf(events), title: async () => { throw new Error('unreadable'); } } as AgentSession;

    const none = await runTurn(async () => sessionOf(events), { ...request, wantTitle: true }, viewOf());
    const failed = await runTurn(async () => failing, { ...request, wantTitle: true }, viewOf());

    expect(none.title).toBeUndefined();
    expect(failed).toMatchObject({ title: undefined, turn: { status: 'completed' } });
  });

  it('keeps the action line out of the record and the view, and takes the title from it', async () => {
    const view = viewOf();
    const events: AgentEvent[] = [
      { type: 'text', delta: 'Scattering.\n@Ti' },
      { type: 'text', delta: 'tle("Rayleigh scattering")\n' },
      { type: 'done', status: 'completed' },
    ];

    const result = await runTurn(async () => sessionOf(events), { ...request, wantTitle: true }, view);

    expect(view.calls).toEqual(['text:Scattering.\n', 'finish:completed']);
    expect(result.turn.parts).toEqual([{ type: 'text', text: 'Scattering.\n' }]);
    expect(result.title).toBe('Rayleigh scattering');
  });

  it('hands a highlight to the view the moment its line ends, records it in place, and keeps the line out of the text', async () => {
    const view = viewOf();
    const events: AgentEvent[] = [
      { type: 'text', delta: 'Look here.\n@Highlight("the slope", "Check this")\nThen' },
      { type: 'text', delta: ' read on.' },
      { type: 'done', status: 'completed' },
    ];

    const result = await runTurn(async () => sessionOf(events), { ...request, context: { ...context, note: { path: 'a.md' } } }, view);

    expect(view.calls).toEqual(['text:Look here.\n', 'act:a.md:the slope', 'text:Then', 'text: read on.', 'finish:completed']);
    expect(result.turn.parts).toEqual([
      { type: 'text', text: 'Look here.\n' },
      { type: 'highlight', step: { path: 'a.md', quote: 'the slope', comment: 'Check this', line: undefined } },
      { type: 'text', text: 'Then read on.' },
    ]);
  });

  it('points a highlight at the note it names, else the note the turn was sent with, else nowhere', async () => {
    const events: AgentEvent[] = [
      { type: 'text', delta: '@Highlight("one two", "x", "notes/b.md")\n@Highlight("three four")\n' },
      { type: 'done', status: 'completed' },
    ];

    const named = viewOf();
    await runTurn(async () => sessionOf(events), { ...request, context: { ...context, note: { path: 'a.md' } } }, named);
    const bare = viewOf();
    const result = await runTurn(async () => sessionOf(events), request, bare);

    expect(named.calls.filter((call) => call.startsWith('act:'))).toEqual(['act:notes/b.md:one two', 'act:a.md:three four']);
    expect(bare.calls.filter((call) => call.startsWith('act:'))).toEqual(['act:notes/b.md:one two']);
    expect(result.turn.parts).toHaveLength(1);
  });

  it('prefers the title the agent reports over one written in the reply, and ignores the reply on later turns', async () => {
    const events: AgentEvent[] = [{ type: 'text', delta: 'Hi.\n@Title("From the reply")\n' }, { type: 'done', status: 'completed' }];
    const named = { ...sessionOf(events), title: async () => 'From the CLI' } as AgentSession;

    expect((await runTurn(async () => named, { ...request, wantTitle: true }, viewOf())).title).toBe('From the CLI');
    expect((await runTurn(async () => sessionOf(events), request, viewOf())).title).toBeUndefined();
  });

  it('asks an agent that cannot name its conversation for a title on the first turn only, after everything else in the turn', async () => {
    const send = jest.fn(async function* (_text: string) { yield { type: 'done', status: 'completed' } as AgentEvent; });
    const unnamed = { id: 's1', send } as unknown as AgentSession;
    const named = { id: 's1', send, title: async () => 'From the CLI' } as unknown as AgentSession;

    await runTurn(async () => unnamed, { ...request, wantTitle: true }, viewOf());
    await runTurn(async () => unnamed, request, viewOf());
    await runTurn(async () => named, { ...request, wantTitle: true }, viewOf());

    const [asked, later, notAsked] = send.mock.calls.map(([text]) => text);
    expect(asked!.startsWith(`${request.text}\n\n<naming>`)).toBe(true);
    expect(asked).toContain('@Title(');
    expect(later).toBe(request.text);
    expect(notAsked).toBe(request.text);
  });
});
