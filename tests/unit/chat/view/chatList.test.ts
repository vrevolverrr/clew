import type { ChatSummary } from '@/chat/ChatRecord';
import { formatWhen, groupByDay, searchChats } from '@/chat/view/chatList';

const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime();
const NOW = at(24, 15);

const chat = (id: string, title: string, text = '', updatedAt = NOW): ChatSummary => ({ id, agent: 'claude', title, updatedAt, text });

describe('searchChats', () => {
  const chats = [
    chat('1', 'Eigenvalues of a matrix', 'Explain eigenvalues. They are the scalars where Av = λv.'),
    chat('2', 'Join algorithms', 'How does a block nested loop join cost buffers? The matrix of costs is small.'),
  ];

  it('keeps all chats for an empty query', () => {
    expect(searchChats(chats, '  ')).toEqual(chats);
  });

  it('matches the title without a snippet', () => {
    const [match] = searchChats(chats, 'eigenvalues');
    expect(match!.id).toBe('1');
    expect(match!.snippet).toBeUndefined();
  });

  it('matches the conversation and shows the words around the hit', () => {
    const matches = searchChats(chats, 'buffers');
    expect(matches.map((m) => m.id)).toEqual(['2']);
    expect(matches[0]!.snippet).toContain('nested loop join cost buffers');
  });

  it('needs every word, in any order and across title and text', () => {
    expect(searchChats(chats, 'matrix costs').map((m) => m.id)).toEqual(['2']);
    expect(searchChats(chats, 'join eigenvalues')).toEqual([]);
  });

  it('ignores case', () => {
    expect(searchChats(chats, 'BLOCK').map((m) => m.id)).toEqual(['2']);
  });
});

describe('groupByDay', () => {
  it('splits by calendar day, not by hours elapsed', () => {
    const groups = groupByDay(
      [chat('a', 'a', '', at(24, 1)), chat('b', 'b', '', at(23, 23)), chat('c', 'c', '', at(20)), chat('d', 'd', '', at(17)), chat('e', 'e', '', at(16)), chat('f', 'f', '', at(1))],
      NOW,
    );

    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['a']],
      ['Yesterday', ['b']],
      ['Previous 7 days', ['c', 'd']],
      ['Older', ['e', 'f']],
    ]);
  });

  it('leaves out groups with no chats', () => {
    expect(groupByDay([chat('a', 'a', '', at(1))], NOW).map((g) => g.label)).toEqual(['Older']);
  });
});

describe('formatWhen', () => {
  it('shows the time for a chat from today', () => {
    expect(formatWhen(at(24, 9), NOW)).toMatch(/9:00/);
  });

  it('shows the date for an earlier day', () => {
    expect(formatWhen(at(3), NOW)).toMatch(/Oct\s+3|3\s+Oct/);
  });
});
