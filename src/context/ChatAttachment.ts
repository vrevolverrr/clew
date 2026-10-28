import { open } from 'fs/promises';

import type { ImageMediaType, TurnImage } from '@/agents/types';

/** An image a message carried, kept in the plugin folder. `path` is relative to the vault. */
export interface ChatImage {
  kind: 'image';
  path: string;
  mediaType: ImageMediaType;
  name: string;
}

/** A file a message names by path. Clew never copies it: the agent reads it with its own tools. */
export interface ChatFile {
  kind: 'file';
  /** Absolute. */
  path: string;
  name: string;
  /** For a file picked by `@`: what the message says after the `@` to name it, in place of a chip. */
  token?: string;
}

/** Text the student pasted that was too long for the input, kept as a file in the plugin folder. `path` is relative to the vault. */
export interface ChatPaste {
  kind: 'paste';
  path: string;
  name: string;
}

export type ChatAttachment = ChatImage | ChatFile | ChatPaste;

/** An attachment kept in the plugin folder, which goes when its chat does. */
export type StoredAttachment = ChatImage | ChatPaste;

/** Where the agent reads an attachment, given the folder a stored attachment's path is relative to. */
export function attachmentFilePath(attachment: ChatAttachment, root: string): string {
  return attachment.kind === 'file' ? attachment.path : `${root}/${attachment.path}`;
}

/** A file the message names with a token in its text rather than showing as a chip. */
export function isMention(attachment: ChatAttachment): attachment is ChatFile & { token: string } {
  return attachment.kind === 'file' && attachment.token !== undefined;
}

export function isStored(attachment: ChatAttachment): attachment is StoredAttachment {
  return attachment.kind !== 'file';
}

/** The picked files by what the message says to name each, to the path shown on hover. */
export function mentionPaths(attachments: readonly ChatAttachment[]): Map<string, string> {
  return new Map(attachments.filter(isMention).map(({ token, path }) => [token, path]));
}

/** How a turn names a file: by the agent's `mention`, which it loads itself, or, without one, by carrying the start of its text. */
export interface TurnFile {
  path: string;
  mention?: string;
}

/** The files and pastes a turn names, by absolute path. A paste is always carried, being long. */
export function turnFiles(attachments: readonly ChatAttachment[], root: string, fileMention?: (path: string) => string | undefined): TurnFile[] {
  return attachments.flatMap((attachment) => {
    if (attachment.kind === 'image') return [];
    const path = attachmentFilePath(attachment, root);
    const mention = attachment.kind === 'file' ? fileMention?.(path) : undefined;
    return [mention === undefined ? { path } : { path, mention }];
  });
}

/** Names an attachment among a message's: a stored path is vault-relative and a file's absolute, but the kind makes it certain. */
export function attachmentKey({ kind, path }: ChatAttachment): string {
  return `${kind}:${path}`;
}

/** The file extension of each image type an agent takes. */
export const IMAGE_EXTENSIONS: Record<ImageMediaType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/** The type of an image file by its extension, or null for any other file. */
export function mediaTypeOfExtension(extension: string): ImageMediaType | null {
  const lower = extension.toLowerCase();
  const type = `image/${lower === 'jpg' ? 'jpeg' : lower}`;
  return isImageMediaType(type) ? type : null;
}

/** The images among the attachments as files the agent reads, given the folder their paths are relative to. */
export function turnImages(attachments: readonly ChatAttachment[], root: string): TurnImage[] {
  return attachments.flatMap((attachment) => (attachment.kind === 'image' ? [{ path: attachmentFilePath(attachment, root), mediaType: attachment.mediaType }] : []));
}

export function isImageMediaType(value: unknown): value is ImageMediaType {
  return typeof value === 'string' && Object.hasOwn(IMAGE_EXTENSIONS, value);
}

/** The most of a file a turn carries. Beyond it the agent reads the file itself. */
export const INLINE_MAX_BYTES = 32 * 1024;
export const INLINE_MAX_LINES = 800;

/** A NUL this early marks a binary file. */
const SNIFF_BYTES = 8192;

/** The start of a text file, whole lines only. */
export interface FileText {
  text: string;
  lines: number;
  /** The file goes on past `text`. */
  truncated: boolean;
}

/** The text of a file to send with a turn, or null for a blank file, a binary one, or text that is not UTF-8. */
export function fileText(head: Uint8Array, size: number): FileText | null {
  if (head.subarray(0, SNIFF_BYTES).includes(0)) return null;
  let text: string;
  try {
    // `stream` holds back a character the byte limit cut in half instead of failing on it.
    text = new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true });
  } catch {
    return null;
  }
  const lines = text.split('\n');
  let truncated = size > head.length;
  // The last piece is empty after a final line break, and cut short when the byte limit ended the text.
  if (lines.length > 1 && (truncated || lines.at(-1) === '')) lines.pop();
  if (lines.length > INLINE_MAX_LINES) {
    lines.length = INLINE_MAX_LINES;
    truncated = true;
  }
  const joined = lines.join('\n');
  return joined.trim() ? { text: joined, lines: lines.length, truncated } : null;
}

/** The start of each file that is text, by path. */
export async function readTexts(paths: readonly string[]): Promise<Map<string, FileText>> {
  const texts = new Map<string, FileText>();
  await Promise.all(
    paths.map(async (path) => {
      const text = await readStart(path);
      if (text) texts.set(path, text);
    }),
  );
  return texts;
}

/** A file that cannot be read is named in the turn without its text; the agent then reports the failed read itself. */
async function readStart(path: string): Promise<FileText | null> {
  try {
    const file = await open(path, 'r');
    try {
      const { size } = await file.stat();
      const head = new Uint8Array(Math.min(size, INLINE_MAX_BYTES));
      const { bytesRead } = await file.read(head, 0, head.length, 0);
      return fileText(head.subarray(0, bytesRead), size);
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}
