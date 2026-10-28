import type { DataAdapter } from 'obsidian';

import type { ChatFiles } from '@/chat/ChatStore';

/** The vault's own file adapter, which reaches the plugin folder inside `.obsidian`; `dir` is the chats folder there. */
export function vaultChatFiles(adapter: DataAdapter, dir: string): ChatFiles {
  return {
    read: async (name) => ((await adapter.exists(`${dir}/${name}`)) ? adapter.read(`${dir}/${name}`) : null),
    write: async (name, text) => {
      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
      await adapter.write(`${dir}/${name}`, text);
    },
    list: async () => ((await adapter.exists(dir)) ? (await adapter.list(dir)).files.map((file) => file.split('/').pop()!) : []),
    remove: async (name) => {
      if (await adapter.exists(`${dir}/${name}`)) await adapter.remove(`${dir}/${name}`);
    },
  };
}
