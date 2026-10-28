import type { ImageMediaType } from '@/agents/types';
import { IMAGE_EXTENSIONS } from '@/context/ChatAttachment';
import { lineCount } from '@/shared/lineCount';

/** Claude 4.7 and later take this long edge natively and downscale anything larger, so more only costs upload time. */
export const MAX_IMAGE_EDGE = 2576;
/** Under the API's 10 MB per image once base64 adds a third. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Where an image is kept: one folder per chat, named by content so the same image is stored once. */
export function imagePath(dir: string, chatId: string, hash: string, mediaType: ImageMediaType): string {
  return `${dir}/${chatId}/${hash}.${IMAGE_EXTENSIONS[mediaType]}`;
}

/** A paste longer than this becomes a file with a chip instead of going into the input. */
export const PASTE_FILE_MIN_CHARS = 2000;

export function pasteName(text: string): string {
  const lines = lineCount(text);
  return `Pasted text · ${lines} ${lines === 1 ? 'line' : 'lines'}`;
}

/** Where a paste is kept: in the chat's folder beside its images, named by content so the same text is stored once. */
export function pastePath(dir: string, chatId: string, hash: string): string {
  return `${dir}/${chatId}/${hash}.txt`;
}

/**
 * How to store an image: null keeps its bytes as they are, else the size and type to re-encode it at.
 * An image too big in pixels shrinks to fit. One too big in bytes keeps its size and becomes a JPEG.
 * A JPEG stays one; any other type becomes a PNG, which keeps screenshot text sharp.
 */
export function storagePlan(width: number, height: number, bytes: number, mediaType: ImageMediaType): { width: number; height: number; mediaType: ImageMediaType } | null {
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
  if (scale === 1 && bytes <= MAX_IMAGE_BYTES) return null;
  const lossy = mediaType === 'image/jpeg' || bytes > MAX_IMAGE_BYTES;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), mediaType: lossy ? 'image/jpeg' : 'image/png' };
}
