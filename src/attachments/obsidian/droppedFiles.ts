import type { App } from 'obsidian';
import { FileSystemAdapter, TFile, TFolder } from 'obsidian';

import { type ChatFile, isImageMediaType, mediaTypeOfExtension } from '@/context/ChatAttachment';

/** What a drop carries: images to store, and other files to name by path. */
export interface Dropped {
  images: File[];
  attachments: ChatFile[];
}

/**
 * Reads what was dropped. Files from the OS come in `dataTransfer.files`; Electron no longer puts a path on them,
 * so `webUtils` gives it. Files dragged from Obsidian's file explorer come in no list: the explorer sets
 * `app.dragManager.draggable` (not in the typings) for the length of the drag. A vault image is read into a `File`
 * so it is stored and sent like any other image.
 */
export async function readDrop(app: App, dataTransfer: DataTransfer | null): Promise<Dropped> {
  const dropped: Dropped = { images: [], attachments: [] };
  const { webUtils } = (window as unknown as { require(id: 'electron'): { webUtils: { getPathForFile(file: File): string } } }).require('electron');
  const files = Array.from(dataTransfer?.files ?? []);
  dropped.images.push(...imageFiles(files));
  for (const file of files) {
    const path = isImageMediaType(file.type) ? '' : webUtils.getPathForFile(file);
    if (path) dropped.attachments.push({ kind: 'file', path, name: file.name });
  }
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) return dropped;
  const draggable = dragged(app);
  for (const entry of draggable?.files ?? [draggable?.file]) {
    if (entry instanceof TFolder) {
      dropped.attachments.push({ kind: 'file', path: adapter.getFullPath(entry.path), name: entry.name });
    } else if (entry instanceof TFile) {
      const mediaType = mediaTypeOfExtension(entry.extension);
      if (mediaType) dropped.images.push(new File([await app.vault.readBinary(entry)], entry.name, { type: mediaType }));
      else dropped.attachments.push({ kind: 'file', path: adapter.getFullPath(entry.path), name: entry.name });
    }
  }
  return dropped;
}

/** Whether a drag over the composer carries something to attach, so the composer shows it will take the drop. */
export function dragCarriesFiles(app: App, dataTransfer: DataTransfer | null): boolean {
  if (dataTransfer?.types.includes('Files')) return true;
  // Other drags, such as a tab or a link, are Obsidian's to handle.
  const type = dragged(app)?.type;
  return type === 'file' || type === 'files';
}

export function imageFiles(files: ArrayLike<File> | null | undefined): File[] {
  return Array.from(files ?? []).filter((file) => isImageMediaType(file.type));
}

/** What the file explorer is dragging, if anything; `dragManager` is not in Obsidian's typings. */
function dragged(app: App): { type?: string; file?: unknown; files?: unknown[] } | null {
  return (app as unknown as { dragManager: { draggable?: { type?: string; file?: unknown; files?: unknown[] } | null } }).dragManager.draggable ?? null;
}
