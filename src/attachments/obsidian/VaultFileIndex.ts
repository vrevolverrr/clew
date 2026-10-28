import type { App, Plugin, TAbstractFile } from 'obsidian';
import { FileSystemAdapter, TFile, TFolder } from 'obsidian';

import type { SkillOption } from '@/agents/types';
import { mediaTypeOfExtension } from '@/context/ChatAttachment';
import { FileSearch } from '@/attachments/FileSearch';

/** A vault file or folder the student can mention, as a row of the mention menu: `description` is its folder, empty at the root, and a folder's `name` ends in a slash. */
export interface MentionFile extends SkillOption {
  fullPath: string;
}

/**
 * Every vault file but the images, and every folder, kept in memory for `@` mentions. Images attach through the image path instead.
 * The index is built at the first search, after the workspace is up, so startup pays nothing; events before then change nothing.
 * A folder delete or rename drops it to be rebuilt at the next search, since Obsidian's events for a folder's children are not relied on.
 */
export class VaultFileIndex {
  private search: FileSearch | null = null;

  constructor(
    private readonly app: App,
    plugin: Plugin,
  ) {
    const { vault } = app;
    plugin.registerEvent(vault.on('create', (file) => this.track(file)));
    plugin.registerEvent(vault.on('delete', (file) => this.forget(file, file.path)));
    plugin.registerEvent(
      vault.on('rename', (file, oldPath) => {
        this.forget(file, oldPath);
        this.track(file);
      }),
    );
  }

  /** The best matches for the query, or the files opened most recently for an empty one. */
  find(query: string, limit: number): MentionFile[] {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return [];
    const search = (this.search ??= this.build());
    const files = query
      ? search.search(query, limit)
      : this.app.workspace
          .getLastOpenFiles()
          .flatMap((path) => search.get(path) ?? [])
          .slice(0, limit);
    return files.map(({ path, name, dir, folder }) => ({ name: folder ? `${name}/` : name, description: dir, fullPath: adapter.getFullPath(path) }));
  }

  private build(): FileSearch {
    const search = new FileSearch();
    for (const file of this.app.vault.getFiles()) if (isIndexed(file)) search.add(file.path);
    for (const folder of this.app.vault.getAllFolders(false)) search.add(folder.path, true);
    return search;
  }

  private track(file: TAbstractFile): void {
    if (!this.search) return;
    if (file instanceof TFolder) this.search.add(file.path, true);
    else if (file instanceof TFile && isIndexed(file)) this.search.add(file.path);
  }

  private forget(file: TAbstractFile, path: string): void {
    if (file instanceof TFile) this.search?.remove(path);
    else this.search = null;
  }
}

/** Images attach through the image path, not as a mention. */
function isIndexed(file: TFile): boolean {
  return !mediaTypeOfExtension(file.extension);
}
