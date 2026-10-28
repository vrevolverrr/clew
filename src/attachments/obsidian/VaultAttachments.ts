import type { DataAdapter } from 'obsidian';

import type { ImageMediaType } from '@/agents/types';
import { imagePath, MAX_IMAGE_BYTES, pasteName, pastePath, storagePlan } from '@/attachments/attachmentStorage';
import { type ChatImage, type ChatPaste, isImageMediaType } from '@/context/ChatAttachment';

const JPEG_QUALITY = 0.85;

/** The chats' images and pasted texts, in one folder per chat inside `dir`, which lies in the plugin folder beside the chats. */
export class VaultAttachments {
  constructor(
    private readonly adapter: DataAdapter,
    private readonly dir: string,
  ) {}

  /** Stores an image in the chat's folder, shrunk if it is too big. The same image is stored once. */
  async save(chatId: string, file: Blob, name: string): Promise<ChatImage> {
    if (!isImageMediaType(file.type)) throw new Error(`${name} is not a PNG, JPEG, GIF, or WebP image.`);
    const { bytes, mediaType } = await encode(file, file.type);
    const hash = await sha256(bytes);
    const path = imagePath(this.dir, chatId, hash, mediaType);
    if (!(await this.adapter.exists(path))) {
      await this.adapter.mkdir(`${this.dir}/${chatId}`);
      await this.adapter.writeBinary(path, bytes);
    }
    return { kind: 'image', path, mediaType, name };
  }

  /** Stores pasted text as a file in the chat's folder. The same text is stored once. */
  async savePaste(chatId: string, text: string): Promise<ChatPaste> {
    const hash = await sha256(new TextEncoder().encode(text));
    const path = pastePath(this.dir, chatId, hash);
    if (!(await this.adapter.exists(path))) {
      await this.adapter.mkdir(`${this.dir}/${chatId}`);
      await this.adapter.write(path, text);
    }
    return { kind: 'paste', path, name: pasteName(text) };
  }

  /** An address the chat can show the image from. */
  url(image: ChatImage): string {
    return this.adapter.getResourcePath(image.path);
  }

  async remove(path: string): Promise<void> {
    if (await this.adapter.exists(path)) await this.adapter.remove(path);
  }

  async removeChat(chatId: string): Promise<void> {
    const folder = `${this.dir}/${chatId}`;
    if (await this.adapter.exists(folder)) await this.adapter.rmdir(folder, true);
  }

  /** Deletes the folder of every chat that is not in `chatIds`, such as one whose file was removed outside the plugin. */
  async sweep(chatIds: ReadonlySet<string>): Promise<void> {
    if (!(await this.adapter.exists(this.dir))) return;
    for (const folder of (await this.adapter.list(this.dir)).folders) {
      if (!chatIds.has(folder.split('/').pop()!)) await this.adapter.rmdir(folder, true);
    }
  }
}

/** The image as it is stored: its own bytes when they fit, else re-drawn at the size and type `storagePlan` gives. */
async function encode(file: Blob, mediaType: ImageMediaType): Promise<{ bytes: ArrayBuffer; mediaType: ImageMediaType }> {
  const bitmap = await createImageBitmap(file);
  try {
    const plan = storagePlan(bitmap.width, bitmap.height, file.size, mediaType);
    if (!plan) return { bytes: await file.arrayBuffer(), mediaType };
    const canvas = new OffscreenCanvas(plan.width, plan.height);
    const context = canvas.getContext('2d')!;
    if (plan.mediaType === 'image/jpeg') {
      // JPEG has no transparency, which would draw black.
      context.fillStyle = '#fff';
      context.fillRect(0, 0, plan.width, plan.height);
    }
    context.drawImage(bitmap, 0, 0, plan.width, plan.height);
    const blob = await canvas.convertToBlob({ type: plan.mediaType, quality: JPEG_QUALITY });
    if (blob.size > MAX_IMAGE_BYTES) throw new Error(`The image is still over ${MAX_IMAGE_BYTES / 1024 / 1024} MB after shrinking.`);
    return { bytes: await blob.arrayBuffer(), mediaType: plan.mediaType };
  } finally {
    bitmap.close();
  }
}

async function sha256(bytes: BufferSource): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.subarray(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
