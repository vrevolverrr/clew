import { FileSystemAdapter, TFile, TFolder } from 'obsidian';

import { VaultFileIndex } from '@/attachments/obsidian/VaultFileIndex';

jest.mock(
  'obsidian',
  () => {
    class TAbstractFile {
      constructor(public path: string) {}
    }
    class TFile extends TAbstractFile {
      get extension(): string {
        return this.path.split('.').pop()!;
      }
    }
    class TFolder extends TAbstractFile {}
    class FileSystemAdapter {
      getFullPath(path: string): string {
        return `/vault/${path}`;
      }
    }
    return { TFile, TFolder, FileSystemAdapter };
  },
  { virtual: true },
);

type Handler = (...args: unknown[]) => void;

const file = (path: string): TFile => Object.assign(new TFile(), { path });
const folder = (path: string): TFolder => Object.assign(new TFolder(), { path });

function setup(files: string[], folders: string[] = [], recent: string[] = []) {
  const handlers: Record<string, Handler> = {};
  const vault = {
    adapter: new FileSystemAdapter(),
    getFiles: jest.fn(() => files.map(file)),
    getAllFolders: jest.fn(() => folders.map(folder)),
    on: (name: string, handler: Handler) => (handlers[name] = handler),
  };
  const index = new VaultFileIndex({ vault, workspace: { getLastOpenFiles: () => recent } } as never, { registerEvent: jest.fn() } as never);
  const names = (query: string): string[] => index.find(query, 8).map((file) => file.name);
  return { index, vault, handlers, names };
}

describe('VaultFileIndex', () => {
  it('lists files and folders with their folder and absolute path, folder names ending in a slash, and no images', () => {
    const { index } = setup(['a.md', 'notes/Week 1.md', 'notes/shot.png'], ['notes', 'notes/Week 3']);
    expect(index.find('week', 8)).toEqual([
      { name: 'Week 3/', description: 'notes', fullPath: '/vault/notes/Week 3' },
      { name: 'Week 1.md', description: 'notes', fullPath: '/vault/notes/Week 1.md' },
    ]);
    expect(index.find('a.md', 8)[0]).toMatchObject({ name: 'a.md', description: '' });
    expect(index.find('shot', 8)).toEqual([]);
  });

  it('reads the vault at the first search, once, and ignores events before it', () => {
    const { names, vault, handlers } = setup(['a.md']);
    handlers.create!(file('early.md'));
    expect(vault.getFiles).not.toHaveBeenCalled();
    expect(names('md')).toEqual(['a.md']);
    names('a');
    expect(vault.getFiles).toHaveBeenCalledTimes(1);
  });

  it('follows a file created, renamed, and deleted without reading the vault again', () => {
    const { names, vault, handlers } = setup(['a.md']);
    names('md');
    handlers.create!(file('b.md'));
    handlers.rename!(file('c.md'), 'a.md');
    expect(names('md')).toEqual(['b.md', 'c.md']);
    handlers.delete!(file('b.md'));
    expect(names('md')).toEqual(['c.md']);
    expect(vault.getFiles).toHaveBeenCalledTimes(1);
  });

  it('adds a new folder in place', () => {
    const { names, vault, handlers } = setup(['a.md']);
    names('md');
    handlers.create!(folder('Week 4'));
    expect(names('week')).toEqual(['Week 4/']);
    expect(vault.getFiles).toHaveBeenCalledTimes(1);
  });

  it('reads the vault again at the next search after a folder is deleted or renamed', () => {
    const files = ['old/a.md'];
    const { names, vault, handlers } = setup(files, ['old']);
    expect(names('a.md')).toEqual(['a.md']);
    files[0] = 'new/a.md';
    handlers.rename!(folder('new'), 'old');
    expect(vault.getFiles).toHaveBeenCalledTimes(1);
    expect(names('a.md')).toEqual(['a.md']);
    expect(vault.getFiles).toHaveBeenCalledTimes(2);
    handlers.delete!(folder('new'));
    names('a.md');
    expect(vault.getFiles).toHaveBeenCalledTimes(3);
  });

  it('lists the files opened most recently for an empty query, leaving out any the index lacks', () => {
    const { names } = setup(['a.md', 'b.md'], [], ['b.md', 'gone.md', 'a.md']);
    expect(names('')).toEqual(['b.md', 'a.md']);
  });
});
