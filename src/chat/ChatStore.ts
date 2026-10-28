import { isPermissionPolicy } from '@/agents/types';
import { isAgentId } from '@/agents/providers';
import { decodeChoice } from '@/chat/ChatDefaults';
import type { ChatRecord, ChatSummary, ChatTurn, ReplyPart, TourStep } from '@/chat/ChatRecord';
import { summarize } from '@/chat/ChatRecord';
import type { NoteQuote } from '@/context/NoteContext';
import { type ChatAttachment, isImageMediaType } from '@/context/ChatAttachment';

/** The file operations the store needs, on file names inside the chats folder. */
export interface ChatFiles {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  list(): Promise<string[]>;
  remove(name: string): Promise<void>;
}

/** Ids name files, so only the ones this module makes are valid. */
export const CHAT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const INDEX = 'index.json';

/**
 * One chat per JSON file. `index.json` beside them holds a summary of each, so listing and searching read one file.
 * The chat files are the truth: `list` reconciles the index with the folder, reading only the files the index lacks.
 */
export class ChatStore {
  private index: Map<string, ChatSummary> | null = null;
  /** Chats deleted in this session, so a turn that ends after the delete cannot bring one back. */
  private readonly removed = new Set<string>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly files: ChatFiles) {}

  /** The stored chat, or null when there is none or the file is not one this store wrote. */
  async load(id: string): Promise<ChatRecord | null> {
    if (!CHAT_ID.test(id)) return null;
    const text = await this.files.read(this.path(id));
    return text === null ? null : parse(text, decodeChat);
  }

  async save(chat: ChatRecord): Promise<void> {
    await this.serial(async () => {
      if (this.removed.has(chat.id)) return;
      await this.files.write(this.path(chat.id), JSON.stringify(chat));
      const index = await this.readIndex();
      index.set(chat.id, summarize(chat));
      await this.writeIndex(index);
    });
  }

  async remove(id: string): Promise<void> {
    if (!CHAT_ID.test(id)) return;
    await this.serial(async () => {
      await this.files.remove(this.path(id));
      this.removed.add(id);
      const index = await this.readIndex();
      if (index.delete(id)) await this.writeIndex(index);
    });
  }

  /** A summary of every readable chat, newest first. A file that does not decode is left out and left alone. */
  async list(): Promise<ChatSummary[]> {
    return this.serial(async () => {
      const index = await this.readIndex();
      const ids = await this.chatIds();
      const onDisk = new Set(ids);
      let changed = false;
      for (const id of index.keys()) {
        if (!onDisk.has(id)) {
          index.delete(id);
          changed = true;
        }
      }
      const added = await Promise.all(ids.filter((id) => !index.has(id)).map((id) => this.load(id).catch(() => null)));
      for (const chat of added) {
        if (!chat) continue;
        index.set(chat.id, summarize(chat));
        changed = true;
      }
      if (changed) await this.writeIndex(index);
      return [...index.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }

  /** The index as last written; empty when the file is missing or corrupt, which `list` then refills from the chat files. */
  private async readIndex(): Promise<Map<string, ChatSummary>> {
    if (!this.index) {
      const text = await this.files.read(INDEX);
      const summaries = (text === null ? null : parse(text, decodeSummaries)) ?? [];
      this.index = new Map(summaries.map((summary) => [summary.id, summary]));
    }
    return this.index;
  }

  private async writeIndex(index: Map<string, ChatSummary>): Promise<void> {
    await this.files.write(INDEX, JSON.stringify([...index.values()]));
  }

  /** The id of every chat file in the folder, readable or not. */
  async chatIds(): Promise<string[]> {
    const names = await this.files.list();
    return names.map((name) => name.replace(/\.json$/, '')).filter((id) => CHAT_ID.test(id));
  }

  /** Index updates read and then write the whole file, so they run one at a time. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private path(id: string): string {
    return `${id}.json`;
  }
}

function parse<T>(text: string, decoder: (value: unknown) => T | null): T | null {
  try {
    return decoder(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Reads a stored index, or null when any entry is not what `summarize` writes. */
export function decodeSummaries(value: unknown): ChatSummary[] | null {
  if (!Array.isArray(value)) return null;
  const summaries: ChatSummary[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const { id, agent, title, updatedAt, text } = entry;
    if (typeof id !== 'string' || !CHAT_ID.test(id)) return null;
    if (!isAgentId(agent)) return null;
    if (typeof title !== 'string' || typeof updatedAt !== 'number' || typeof text !== 'string') return null;
    summaries.push({ id, agent, title, updatedAt, text });
  }
  return summaries;
}

/** Reads a stored chat, or null when any field is not what this module writes. */
export function decodeChat(value: unknown): ChatRecord | null {
  if (!isRecord(value)) return null;
  const { id, agent, sessionId, title, updatedAt, turns, choice } = value;
  const permissionPolicy = value.permissionPolicy;
  if (permissionPolicy !== undefined && !isPermissionPolicy(permissionPolicy)) return null;
  if (typeof id !== 'string' || !CHAT_ID.test(id)) return null;
  if (!isAgentId(agent)) return null;
  if (sessionId !== undefined && typeof sessionId !== 'string') return null;
  const modelChoice = choice === undefined ? undefined : decodeChoice(choice);
  if (modelChoice === null) return null;
  if (typeof title !== 'string' || typeof updatedAt !== 'number' || !Array.isArray(turns)) return null;
  const decoded = turns.map(decodeTurn);
  if (decoded.some((turn) => turn === null)) return null;
  return { id, agent, sessionId, title, updatedAt, turns: decoded as ChatTurn[], ...(modelChoice ? { choice: modelChoice } : {}), ...(permissionPolicy ? { permissionPolicy } : {}) };
}

function decodeTurn(value: unknown): ChatTurn | null {
  if (!isRecord(value)) return null;
  const { message, quote, attachments, parts, status, error, at, rating, prompt } = value;
  if (typeof message !== 'string' || !Array.isArray(parts)) return null;
  const decodedQuote = quote === undefined ? undefined : decodeQuote(quote);
  if (decodedQuote === null) return null;
  const decodedAttachments = attachments === undefined ? undefined : decodeList(attachments, decodeAttachment);
  if (decodedAttachments === null) return null;
  if (status !== 'completed' && status !== 'interrupted' && status !== 'failed') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  if (at !== undefined && typeof at !== 'number') return null;
  if (rating !== undefined && rating !== 'up' && rating !== 'down') return null;
  if (prompt !== undefined && typeof prompt !== 'string') return null;
  const decoded = parts.map(decodePart);
  if (decoded.some((part) => part === null)) return null;
  return { message, quote: decodedQuote, attachments: decodedAttachments, parts: decoded as ReplyPart[], status, error, at, rating, prompt };
}

function decodeList<T>(value: unknown, decodeEntry: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const list: T[] = [];
  for (const entry of value) {
    const decoded = decodeEntry(entry);
    if (decoded === null) return null;
    list.push(decoded);
  }
  return list;
}

function decodeAttachment(value: unknown): ChatAttachment | null {
  if (!isRecord(value)) return null;
  const { kind, path, name, mediaType, token } = value;
  if (typeof path !== 'string' || typeof name !== 'string') return null;
  if (kind === 'paste') return { kind, path, name };
  if (kind === 'file') return typeof token === 'string' ? { kind, path, name, token } : { kind, path, name };
  return kind === 'image' && isImageMediaType(mediaType) ? { kind, path, name, mediaType } : null;
}

function decodeQuote(value: unknown): NoteQuote | null {
  if (!isRecord(value)) return null;
  const { text, path, startLine, page, source } = value;
  if (typeof text !== 'string' || typeof path !== 'string') return null;
  if (source !== undefined && source !== 'chat') return null;
  if ((startLine !== undefined && typeof startLine !== 'number') || (page !== undefined && typeof page !== 'number')) return null;
  return { text, path, startLine, page, ...(source ? { source } : {}) };
}

function decodePart(value: unknown): ReplyPart | null {
  if (!isRecord(value)) return null;
  if (value.type === 'text') return typeof value.text === 'string' ? { type: 'text', text: value.text } : null;
  if (value.type === 'highlight') {
    const step = decodeStep(value.step);
    return step ? { type: 'highlight', step } : null;
  }
  const { id, name, title, status } = value;
  if (value.type !== 'tool' || typeof id !== 'string' || typeof name !== 'string' || typeof title !== 'string') return null;
  if (status !== 'running' && status !== 'done' && status !== 'failed') return null;
  return { type: 'tool', id, name, title, status };
}

function decodeStep(value: unknown): TourStep | null {
  if (!isRecord(value)) return null;
  const { path, quote, comment, line } = value;
  if (typeof path !== 'string' || typeof quote !== 'string') return null;
  if ((comment !== undefined && typeof comment !== 'string') || (line !== undefined && typeof line !== 'number')) return null;
  return { path, quote, comment, line };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
