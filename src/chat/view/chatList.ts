import type { ChatSummary } from '@/chat/ChatRecord';

export interface ChatMatch extends ChatSummary {
  /** A stretch of the conversation around the match, when the title alone does not explain it. */
  snippet?: string;
}

interface DayGroup<T> {
  label: string;
  items: T[];
}

const DAY_MS = 86_400_000;
const TIME = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });
const DATE = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' });
const SNIPPET_BEFORE = 30;
const SNIPPET_AFTER = 70;

/** Chats whose title or conversation holds every word of the query, in the order given. An empty query matches all. */
export function searchChats(chats: ChatSummary[], query: string): ChatMatch[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return chats;
  const matches: ChatMatch[] = [];
  for (const chat of chats) {
    const title = chat.title.toLowerCase();
    const text = chat.text.toLowerCase();
    if (!words.every((word) => title.includes(word) || text.includes(word))) continue;
    matches.push(words.every((word) => title.includes(word)) ? chat : { ...chat, snippet: snippetAround(chat.text, text, words) });
  }
  return matches;
}

function snippetAround(original: string, lowered: string, words: string[]): string {
  const at = words.map((word) => lowered.indexOf(word)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = Math.min(original.length, at + SNIPPET_AFTER);
  return `${start > 0 ? '…' : ''}${original.slice(start, end).trim()}${end < original.length ? '…' : ''}`;
}

/** Splits a newest-first list into Today, Yesterday, Previous 7 days and Older, leaving out the empty ones. */
export function groupByDay<T extends { updatedAt: number }>(items: T[], now: number): DayGroup<T>[] {
  const today = startOfDay(now);
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const label = dayLabel(Math.round((today - startOfDay(item.updatedAt)) / DAY_MS));
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function dayLabel(daysAgo: number): string {
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return daysAgo <= 7 ? 'Previous 7 days' : 'Older';
}

function startOfDay(time: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** The time for today's chats, else the date. */
export function formatWhen(time: number, now: number): string {
  const date = new Date(time);
  return (date.toDateString() === new Date(now).toDateString() ? TIME : DATE).format(date);
}
