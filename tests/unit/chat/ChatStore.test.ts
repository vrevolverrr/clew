import type { AgentEvent } from '@/agents/types';
import type { ChatFiles } from '@/chat/ChatStore';
import { ChatStore, decodeChat, decodeSummaries } from '@/chat/ChatStore';
import type { ChatRecord } from '@/chat/ChatRecord';
import { recordEvent, recordHighlight, startTurn, summarize } from '@/chat/ChatRecord';

const A = '3f0c1b7e-5a44-4d0e-9c1a-2b6f8e7d9a10';
const B = '9d2e4c68-1b73-4f25-8a0c-5e6d7f8091a2';
const ID = A;

function record(events: AgentEvent[]) {
  return events.reduce(recordEvent, startTurn('Why is the sky blue?'));
}

class MemoryFiles implements ChatFiles {
  readonly files = new Map<string, string>();
  async read(path: string) { return this.files.get(path) ?? null; }
  async write(path: string, text: string) { this.files.set(path, text); }
  async list() { return [...this.files.keys()]; }
  async remove(path: string) { this.files.delete(path); }
}

const chat = (id: string, updatedAt: number, message = ''): ChatRecord => ({
  id,
  agent: 'claude',
  sessionId: 's',
  title: id,
  updatedAt,
  turns: message ? [{ message, parts: [{ type: 'text', text: `About ${message}` }], status: 'completed' }] : [],
});
const INDEX = 'index.json';

/** Records the paths read from now on. */
function spyOnReads(files: MemoryFiles): string[] {
  const reads: string[] = [];
  const read = files.read.bind(files);
  files.read = async (path) => (reads.push(path), read(path));
  return reads;
}

describe('ChatStore', () => {
  it('saves a chat and loads it back', async () => {
    const store = new ChatStore(new MemoryFiles());

    await store.save(chat(A, 1));

    expect(await store.load(A)).toEqual(chat(A, 1));
  });

  it('lists chats newest first and skips files it did not write', async () => {
    const files = new MemoryFiles();
    const store = new ChatStore(files);
    await store.save(chat(A, 1));
    await store.save(chat(B, 2));
    files.files.set('notes.json', '{}');
    files.files.set(`${B.replace('9', '8')}.json`, 'not json');

    expect((await store.list()).map((c) => c.id)).toEqual([B, A]);
  });

  it('never turns an id into a path outside its folder', async () => {
    const files = new MemoryFiles();
    files.files.set('data.json', JSON.stringify(chat(A, 1)));
    const store = new ChatStore(files);

    expect(await store.load('../data')).toBeNull();
    await store.remove('../data');
    expect(files.files.has('data.json')).toBe(true);
  });

  it('answers null for a chat that is missing or corrupt', async () => {
    const files = new MemoryFiles();
    files.files.set(`${A}.json`, '{"id":');
    const store = new ChatStore(files);

    expect(await store.load(A)).toBeNull();
    expect(await store.load(B)).toBeNull();
  });

  it('keeps an index of summaries that the next store reads without opening the chats', async () => {
    const files = new MemoryFiles();
    await new ChatStore(files).save(chat(A, 1, 'eigenvalues'));
    const reads = spyOnReads(files);

    const listed = await new ChatStore(files).list();

    expect(listed).toEqual([{ id: A, agent: 'claude', title: A, updatedAt: 1, text: 'eigenvalues About eigenvalues' }]);
    expect(reads).toEqual([INDEX]);
  });

  it('rebuilds a missing or corrupt index from the chat files', async () => {
    const files = new MemoryFiles();
    await new ChatStore(files).save(chat(A, 1));
    await new ChatStore(files).save(chat(B, 2));
    files.files.set(INDEX, '[{"id":');

    expect((await new ChatStore(files).list()).map((c) => c.id)).toEqual([B, A]);
    expect(JSON.parse(files.files.get(INDEX)!)).toHaveLength(2);

    files.files.delete(INDEX);
    expect((await new ChatStore(files).list()).map((c) => c.id)).toEqual([B, A]);
  });

  it('follows chat files added or deleted behind its back', async () => {
    const files = new MemoryFiles();
    const store = new ChatStore(files);
    await store.save(chat(A, 1));
    await store.list();
    files.files.set(`${B}.json`, JSON.stringify(chat(B, 2)));
    expect((await store.list()).map((c) => c.id)).toEqual([B, A]);

    files.files.delete(`${A}.json`);
    expect((await store.list()).map((c) => c.id)).toEqual([B]);
  });

  it('does not reread indexed chats because another file does not decode', async () => {
    const files = new MemoryFiles();
    const store = new ChatStore(files);
    await store.save(chat(A, 1));
    files.files.set(`${B}.json`, 'not json');
    await store.list();
    const reads = spyOnReads(files);

    expect((await store.list()).map((c) => c.id)).toEqual([A]);

    expect(reads).toEqual([`${B}.json`]);
  });

  it('keeps saving a chat whose delete failed', async () => {
    const files = new MemoryFiles();
    const store = new ChatStore(files);
    await store.save(chat(A, 1));
    const remove = files.remove.bind(files);
    files.remove = async () => {
      throw new Error('locked');
    };

    await expect(store.remove(A)).rejects.toThrow('locked');
    files.remove = remove;
    await store.save(chat(A, 2));

    expect((await store.list()).map((c) => c.updatedAt)).toEqual([2]);
  });

  it('drops a removed chat from the index and ignores a save that lands after it', async () => {
    const files = new MemoryFiles();
    const store = new ChatStore(files);
    await store.save(chat(A, 1));
    await store.save(chat(B, 2));

    await store.remove(A);
    await store.save(chat(A, 3));

    expect((await store.list()).map((c) => c.id)).toEqual([B]);
    expect(files.files.has(`${A}.json`)).toBe(false);
  });

  it('keeps every chat when saves overlap', async () => {
    const store = new ChatStore(new MemoryFiles());

    await Promise.all([store.save(chat(A, 1)), store.save(chat(B, 2))]);

    expect((await store.list()).map((c) => c.id)).toEqual([B, A]);
  });
});

describe('decodeChat', () => {
  const chat: ChatRecord = {
    id: ID,
    agent: 'codex',
    sessionId: 'thread-9',
    title: 'Why is the sky blue?',
    updatedAt: 1_700_000_000_000,
    turns: [record([{ type: 'text', delta: 'Scattering.' }, { type: 'tool', id: 't', name: 'Read', title: 'Read a.md', status: 'failed' }, { type: 'done', status: 'completed' }])],
  };

  it('reads back what was stored as JSON', () => {
    expect(decodeChat(JSON.parse(JSON.stringify(chat)))).toEqual(chat);
  });

  it.each(['inherit', 'auto', 'approval', 'bypass'])('keeps the %s permission policy', (permissionPolicy) => {
    expect(decodeChat(JSON.parse(JSON.stringify({ ...chat, permissionPolicy })))?.permissionPolicy).toBe(permissionPolicy);
  });

  it('inherits for older chats and refuses malformed permission policies', () => {
    expect(decodeChat(chat)?.permissionPolicy).toBeUndefined();
    for (const permissionPolicy of ['always', null, 1, {}, []]) expect(decodeChat({ ...chat, permissionPolicy })).toBeNull();
  });

  it('keeps the stops a reply pointed at, in place among its text', () => {
    const step = { path: 'optics.md', quote: 'blue light', comment: 'Why', line: 4 };
    const turn = recordEvent(recordHighlight(recordEvent(startTurn('Walk me through'), { type: 'text', delta: 'Look:' }), step), { type: 'text', delta: 'Then.' });
    const stored = { ...chat, turns: [turn] };

    expect(turn.parts.map((part) => part.type)).toEqual(['text', 'highlight', 'text']);
    expect(decodeChat(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it('keeps a thumb and the prompt a turn ran under, and refuses a thumb that is neither', () => {
    const rated = { ...chat, turns: [{ ...chat.turns[0]!, rating: 'down' as const, prompt: '1a2b3c4d' }] };
    const stored = JSON.parse(JSON.stringify(rated));

    expect(decodeChat(stored)?.turns[0]).toMatchObject({ rating: 'down', prompt: '1a2b3c4d' });
    expect(decodeChat({ ...stored, turns: [{ ...stored.turns[0], rating: 'sideways' }] })).toBeNull();
    expect(decodeChat({ ...stored, turns: [{ ...stored.turns[0], prompt: 7 }] })).toBeNull();
  });

  it('keeps the quote a turn was sent with', () => {
    const quoted = { ...chat, turns: [startTurn('Explain this', { text: 'Rayleigh scattering', path: 'optics.md', startLine: 12 })] };
    expect(decodeChat(JSON.parse(JSON.stringify(quoted)))?.turns[0]?.quote).toEqual({ text: 'Rayleigh scattering', path: 'optics.md', startLine: 12 });
  });

  it('keeps chat quote provenance and rejects an unknown source', () => {
    const quoted = { ...chat, turns: [startTurn('Explain this', { text: 'Earlier reply', path: ID, source: 'chat' })] };
    expect(decodeChat(JSON.parse(JSON.stringify(quoted)))?.turns[0]?.quote).toEqual({ text: 'Earlier reply', path: ID, source: 'chat' });
    expect(decodeChat({ ...quoted, turns: [{ ...quoted.turns[0], quote: { text: 'x', path: ID, source: 'unknown' } }] })).toBeNull();
  });

  it('keeps the chat model choice and accepts older chats without one', () => {
    const chosen = { ...chat, choice: { model: 'model-a', effort: 'medium' } };
    expect(decodeChat(JSON.parse(JSON.stringify(chosen)))?.choice).toEqual(chosen.choice);
    expect(decodeChat(chat)?.choice).toBeUndefined();
    expect(decodeChat({ ...chat, choice: 'model-a' })).toBeNull();
  });

  it('keeps the images, files, pastes and picked-file tokens a turn was sent with, in order', () => {
    const attachments = [
      { kind: 'file' as const, path: '/Users/me/week1.pdf', name: 'week1.pdf' },
      { kind: 'image' as const, path: 'attachments/chat/a1.png', mediaType: 'image/png' as const, name: 'image.png' },
      { kind: 'paste' as const, path: 'p/attachments/chat/ab.txt', name: 'Pasted text · 900 lines' },
      { kind: 'file' as const, path: '/v/week1.md', name: 'week1.md', token: 'week1.md' },
    ];
    const withAttachments = { ...chat, turns: [startTurn('compare @week1.md', undefined, attachments)] };
    expect(decodeChat(JSON.parse(JSON.stringify(withAttachments)))?.turns[0]?.attachments).toEqual(attachments);
  });

  it.each([
    ['a non-object', 'chat'],
    ['an id that is not a uuid', { ...chat, id: '../../data' }],
    ['an unknown agent', { ...chat, agent: 'gemini' }],
    ['a session id that is not text', { ...chat, sessionId: 4 }],
    ['turns that are not a list', { ...chat, turns: {} }],
    ['an end time that is not a number', { ...chat, turns: [{ message: 'q', parts: [], status: 'completed', at: 'noon' }] }],
    ['a quote that is not an object', { ...chat, turns: [{ message: 'q', quote: 'text', parts: [], status: 'completed' }] }],
    ['a quote with no path', { ...chat, turns: [{ message: 'q', quote: { text: 'a' }, parts: [], status: 'completed' }] }],
    ['attachments that are not a list', { ...chat, turns: [{ message: 'q', attachments: 'a.pdf', parts: [], status: 'completed' }] }],
    ['an attachment of an unknown kind', { ...chat, turns: [{ message: 'q', attachments: [{ kind: 'audio', path: 'a', name: 'a' }], parts: [], status: 'completed' }] }],
    ['an attachment with no kind', { ...chat, turns: [{ message: 'q', attachments: [{ path: '/a.pdf', name: 'a.pdf' }], parts: [], status: 'completed' }] }],
    ['an image of an unknown type', { ...chat, turns: [{ message: 'q', attachments: [{ kind: 'image', path: 'a', mediaType: 'image/bmp', name: 'a' }], parts: [], status: 'completed' }] }],
    ['an image with no name', { ...chat, turns: [{ message: 'q', attachments: [{ kind: 'image', path: 'a', mediaType: 'image/png' }], parts: [], status: 'completed' }] }],
    ['a file with no path', { ...chat, turns: [{ message: 'q', attachments: [{ kind: 'file', name: 'a.pdf' }], parts: [], status: 'completed' }] }],
    ['a turn with an unknown status', { ...chat, turns: [{ message: 'q', parts: [], status: 'weird' }] }],
    ['a reply part of an unknown type', { ...chat, turns: [{ message: 'q', parts: [{ type: 'image' }], status: 'completed' }] }],
    ['a highlight with no quote', { ...chat, turns: [{ message: 'q', parts: [{ type: 'highlight', step: { path: 'a.md' } }], status: 'completed' }] }],
    ['a highlight whose comment is not text', { ...chat, turns: [{ message: 'q', parts: [{ type: 'highlight', step: { path: 'a.md', quote: 'q', comment: 3 } }], status: 'completed' }] }],
    ['a tool part with a bad status', { ...chat, turns: [{ message: 'q', parts: [{ type: 'tool', id: 't', name: 'n', title: 't', status: 'x' }], status: 'completed' }] }],
  ])('refuses %s', (_name, value) => {
    expect(decodeChat(value)).toBeNull();
  });
});

describe('decodeSummaries', () => {
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

  it('reads back what it wrote and refuses anything else', () => {
    expect(decodeSummaries([summarize(chat)])).toEqual([summarize(chat)]);
    expect(decodeSummaries({})).toBeNull();
    expect(decodeSummaries([{ ...summarize(chat), id: '../x' }])).toBeNull();
    expect(decodeSummaries([{ ...summarize(chat), agent: 'gemini' }])).toBeNull();
    expect(decodeSummaries([{ ...summarize(chat), text: 3 }])).toBeNull();
  });
});
