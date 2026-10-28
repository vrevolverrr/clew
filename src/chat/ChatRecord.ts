import type { AgentEvent, AgentId, PermissionPolicy, TurnStatus } from '@/agents/types';
import type { NoteQuote } from '@/context/NoteContext';
import type { ModelChoice } from '@/chat/ChatDefaults';
import { type ChatAttachment, isStored } from '@/context/ChatAttachment';

export type ToolPart = Extract<AgentEvent, { type: 'tool' }>;

/** One stop of a walk through the student's notes. */
export interface TourStep {
  /** Relative to the vault. */
  path: string;
  quote: string;
  comment?: string;
  line?: number;
}

/**
 * One piece of a reply in the order the agent wrote it. A tool call keeps the place of its first event, with its
 * latest status. A highlight is a stop the agent pointed at in a note, kept so a saved chat can walk through it again.
 */
export type ReplyPart = { type: 'text'; text: string } | ToolPart | { type: 'highlight'; step: TourStep };

export interface ChatTurn {
  message: string;
  quote?: NoteQuote;
  attachments?: ChatAttachment[];
  parts: ReplyPart[];
  status: TurnStatus;
  error?: string;
  /** Milliseconds since the epoch when the turn ended; absent for a turn that never reported an end, and for chats saved before it was kept. */
  at?: number;
  /** The student's thumb on the reply; absent until they give one. */
  rating?: Rating;
  /** `promptId` of the system prompt the agent ran under; absent for chats saved before it was kept. */
  prompt?: string;
}

export type Rating = 'up' | 'down';

/** The chat with turn `index` rated, or with its rating taken off when `rating` is undefined. A missing turn leaves the chat as it was. */
export function rateTurn(chat: ChatRecord, index: number, rating: Rating | undefined): ChatRecord {
  if (!chat.turns[index]) return chat;
  const turns = chat.turns.map((turn, i) => {
    if (i !== index) return turn;
    const { rating: _previous, ...rest } = turn;
    return rating ? { ...rest, rating } : rest;
  });
  return { ...chat, turns };
}

/** What a chat keeps between sessions: the transcript to show, and the agent's own id to resume. */
export interface ChatRecord {
  id: string;
  agent: AgentId;
  /** This chat's model and effort choice; older chats use the saved default. */
  choice?: ModelChoice;
  /** Absent in older chats: inherit the agent's native configuration. */
  permissionPolicy?: PermissionPolicy;
  /** The `AgentSession.id` of the conversation this agent holds; absent once the chat has moved to an agent that never saw it. */
  sessionId?: string;
  title: string;
  /** Milliseconds since the epoch. */
  updatedAt: number;
  turns: ChatTurn[];
}

/** What the chat list needs of a chat, so it can list, group and search without opening the chat's file. */
export interface ChatSummary {
  id: string;
  agent: AgentId;
  title: string;
  updatedAt: number;
  /** The start of the conversation as one line, for search. */
  text: string;
}

const TITLE_LENGTH = 48;
const SEARCH_TEXT_LENGTH = 4000;

/** A chat with no turns yet; it is saved by its first turn. */
export function newChat(id: string, agent: AgentId): ChatRecord {
  return { id, agent, title: '', updatedAt: Date.now(), turns: [] };
}

export function startTurn(message: string, quote?: NoteQuote, attachments?: readonly ChatAttachment[]): ChatTurn {
  // Until the agent says otherwise, a turn that never finished counts as stopped.
  return { message, quote, attachments: attachments?.length ? [...attachments] : undefined, parts: [], status: 'interrupted' };
}

/** Whether a turn of the chat shows the stored image or paste, so its file must stay. */
export function usesStoredFile(turns: readonly ChatTurn[], path: string): boolean {
  return turns.some((turn) => turn.attachments?.some((attachment) => isStored(attachment) && attachment.path === path));
}

export function recordEvent(turn: ChatTurn, event: AgentEvent): ChatTurn {
  switch (event.type) {
    case 'text': {
      const last = turn.parts.at(-1);
      const parts = last?.type === 'text'
        ? [...turn.parts.slice(0, -1), { type: 'text' as const, text: last.text + event.delta }]
        : [...turn.parts, { type: 'text' as const, text: event.delta }];
      return { ...turn, parts };
    }
    case 'tool': {
      const known = turn.parts.some((part) => part.type === 'tool' && part.id === event.id);
      const parts = known ? turn.parts.map((part) => (part.type === 'tool' && part.id === event.id ? event : part)) : [...turn.parts, event];
      return { ...turn, parts };
    }
    case 'done':
      return { ...turn, status: event.status, error: event.error, at: Date.now() };
    case 'thinking':
    case 'usage':
    case 'approval':
      return turn;
  }
}

export function recordHighlight(turn: ChatTurn, step: TourStep): ChatTurn {
  return { ...turn, parts: [...turn.parts, { type: 'highlight', step }] };
}

export function chatTitle(message: string): string {
  const line = message.trim().split('\n')[0]!.trim();
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line;
}

/** A chat takes its title from its first turn: the message, or the name of the first thing attached when there is none. */
export function turnTitle({ message, attachments }: ChatTurn): string {
  return chatTitle(message.trim() ? message : (attachments?.[0]?.name ?? ''));
}

export function summarize(chat: ChatRecord): ChatSummary {
  const text = chat.turns
    .flatMap((turn) => [turn.message, ...turn.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))])
    .join('\n')
    .replace(/\s+/g, ' ')
    .slice(0, SEARCH_TEXT_LENGTH);
  return { id: chat.id, agent: chat.agent, title: chat.title, updatedAt: chat.updatedAt, text };
}
