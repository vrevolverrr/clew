import type { AgentEvent } from '@/agents/types';
import type { ChatRecord } from '@/chat/ChatRecord';
import { chatTitle, rateTurn, recordEvent, recordHighlight, startTurn, summarize, turnTitle, usesStoredFile } from '@/chat/ChatRecord';

const ID = '3f0c1b7e-5a44-4d0e-9c1a-2b6f8e7d9a10';

function record(events: AgentEvent[]) {
  return events.reduce(recordEvent, startTurn('Why is the sky blue?'));
}

describe('recordEvent', () => {
  it('joins streamed text into one part and ends with the status the agent reported', () => {
    const turn = record([
      { type: 'text', delta: 'Rayleigh ' },
      { type: 'text', delta: 'scattering.' },
      { type: 'done', status: 'completed' },
    ]);

    expect(turn).toEqual({ message: 'Why is the sky blue?', parts: [{ type: 'text', text: 'Rayleigh scattering.' }], status: 'completed', error: undefined, at: expect.any(Number) });
  });

  it('keeps a tool call where it began, with its last status, between the text around it', () => {
    const turn = record([
      { type: 'text', delta: 'Let me look.' },
      { type: 'tool', id: 't1', name: 'Read', title: 'Read notes.md', status: 'running' },
      { type: 'tool', id: 't2', name: 'Read', title: 'Read other.md', status: 'running' },
      { type: 'tool', id: 't1', name: 'Read', title: 'Read notes.md', status: 'done' },
      { type: 'text', delta: 'Found it.' },
    ]);

    expect(turn.parts).toEqual([
      { type: 'text', text: 'Let me look.' },
      { type: 'tool', id: 't1', name: 'Read', title: 'Read notes.md', status: 'done' },
      { type: 'tool', id: 't2', name: 'Read', title: 'Read other.md', status: 'running' },
      { type: 'text', text: 'Found it.' },
    ]);
  });

  it('drops thinking, keeps a failure message, and counts an unfinished turn as stopped', () => {
    expect(record([{ type: 'thinking' }]).parts).toEqual([]);
    expect(record([{ type: 'thinking' }]).status).toBe('interrupted');
    expect(record([{ type: 'done', status: 'failed', error: 'Not signed in' }])).toMatchObject({ status: 'failed', error: 'Not signed in' });
  });

  it('does not change the turn it was given', () => {
    const before = startTurn('hi');
    recordEvent(before, { type: 'text', delta: 'x' });
    expect(before.parts).toEqual([]);
  });
});

describe('chatTitle', () => {
  it('takes the first line and cuts a long one with an ellipsis', () => {
    expect(chatTitle('  What is a limit?\nPlease be brief.')).toBe('What is a limit?');
    expect(chatTitle('a'.repeat(80))).toBe(`${'a'.repeat(47)}…`);
  });
});

describe('turnTitle', () => {
  const image = { kind: 'image' as const, path: 'p/a.png', mediaType: 'image/png' as const, name: 'shot.png' };
  const file = { kind: 'file' as const, path: '/Users/me/week1.pdf', name: 'week1.pdf' };

  it('takes the message, else the name of the first thing attached', () => {
    expect(turnTitle(startTurn('Why?', undefined, [image, file]))).toBe('Why?');
    expect(turnTitle(startTurn('  ', undefined, [image, file]))).toBe('shot.png');
    expect(turnTitle(startTurn('', undefined, [file, image]))).toBe('week1.pdf');
  });
});

describe('summarize', () => {
  const chat: ChatRecord = {
    id: ID,
    agent: 'codex',
    title: 'Sky',
    updatedAt: 5,
    turns: [{
      message: 'Why is the sky\nblue?',
      parts: [{ type: 'tool', id: 't', name: 'Read', title: 'Read notes.md', status: 'done' }, { type: 'text', text: 'Rayleigh   scattering.' }],
      status: 'completed',
    }],
  };

  it('flattens the messages and reply text to one line and leaves out tool calls', () => {
    expect(summarize(chat)).toEqual({ id: ID, agent: 'codex', title: 'Sky', updatedAt: 5, text: 'Why is the sky blue? Rayleigh scattering.' });
  });

  it('keeps only the start of a long conversation', () => {
    const long = { ...chat, turns: [{ ...chat.turns[0]!, message: 'x'.repeat(10_000) }] };
    expect(summarize(long).text).toHaveLength(4000);
  });
});

describe('usesStoredFile', () => {
  const turns = [startTurn('a'), startTurn('b', undefined, [
    { kind: 'file', path: 'x/1.png', name: 'a file by that path is not an image' },
    { kind: 'image', path: 'x/1.png', mediaType: 'image/png', name: 'one' },
  ])];

  it('counts an image, not a file at the same path', () => {
    expect(usesStoredFile([startTurn('c', undefined, [{ kind: 'file', path: 'x/9.png', name: 'a file' }])], 'x/9.png')).toBe(false);
  });

  it('finds an image any turn shows, and no other', () => {
    expect(usesStoredFile(turns, 'x/1.png')).toBe(true);
    expect(usesStoredFile(turns, 'x/2.png')).toBe(false);
  });
});

describe('rateTurn', () => {
  const turns = [startTurn('one'), startTurn('two')];
  const chat: ChatRecord = { id: ID, agent: 'claude', title: 't', updatedAt: 1, turns };

  it('rates one turn and leaves the others and the chat it was given alone', () => {
    const next = rateTurn(chat, 1, 'up');

    expect(next.turns.map((turn) => turn.rating)).toEqual([undefined, 'up']);
    expect(chat.turns[1]!.rating).toBeUndefined();
  });

  it('replaces a thumb, and takes it off without leaving the key behind', () => {
    const down = rateTurn(rateTurn(chat, 0, 'up'), 0, 'down');
    const none = rateTurn(down, 0, undefined);

    expect(down.turns[0]!.rating).toBe('down');
    expect('rating' in none.turns[0]!).toBe(false);
  });

  it('leaves the chat as it was when the turn is not there', () => {
    expect(rateTurn(chat, 5, 'up')).toBe(chat);
  });
});
