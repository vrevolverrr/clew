import { CodexToolAdapter } from '@/agents/codex/CodexToolAdapter';
import type { CommandAction, ThreadItem } from '@/agents/codex/codexProtocol';
import type { AgentTool } from '@/agents/types';

const custom: AgentTool = {
  name: 'lookup', description: 'Look up a pack', argument: { name: 'name', values: ['plot', 'grid'] },
  run: (name) => 'Pack: ' + name, title: (name) => 'Loaded ' + name,
};

it('registers the exact Clew tool contract, and nothing for no tools', () => {
  expect(new CodexToolAdapter('/vault', [custom]).registration()).toEqual({ dynamicTools: [{
    type: 'function', name: 'lookup', description: 'Look up a pack',
    inputSchema: { type: 'object', properties: { name: { type: 'string', enum: ['plot', 'grid'] } }, required: ['name'], additionalProperties: false },
  }] });
  expect(new CodexToolAdapter('/vault', []).registration()).toEqual({});
});

it.each<[ThreadItem, string, string]>([
  [{ type: 'fileChange', id: 'i', changes: [{ path: '/vault/a.md' }, { path: '/outside/b.md' }], status: 'completed' }, 'Edit', 'Edited a.md, b.md'],
  [{ type: 'dynamicToolCall', id: 'i', tool: 'lookup', arguments: { name: 'grid' }, status: 'completed' }, 'lookup', 'Loaded grid'],
  [{ type: 'dynamicToolCall', id: 'i', tool: 'unknown', arguments: {}, status: 'completed' }, 'unknown', 'Used unknown'],
  [{ type: 'mcpToolCall', id: 'i', tool: 'external', status: 'completed' }, 'external', 'Used external'],
  [{ type: 'webSearch', id: 'i', query: 'topic' }, 'WebSearch', 'Searched the web for topic'],
  [{ type: 'imageView', id: 'i', path: '/vault/picture.png' }, 'ViewImage', 'Viewed picture.png'],
])('normalizes native %s activity', (item, name, title) => {
  const adapter = new CodexToolAdapter('/vault', [custom]);
  expect([...adapter.events({ item, phase: 'started' })]).toEqual([{ type: 'tool', id: 'i', name, title, status: 'running' }]);
  expect([...adapter.events({ item, phase: 'completed' })]).toEqual([{ type: 'tool', id: 'i', name, title, status: 'done' }]);
  if ('status' in item) {
    expect([...adapter.events({ item: { ...item, status: 'declined' }, phase: 'completed' })]).toEqual([{ type: 'tool', id: 'i', name, title, status: 'failed' }]);
  }
});

it.each<[CommandAction[], string, string]>([
  [[{ type: 'read', command: 'cat a.md', name: 'a', path: '/vault/a.md' }], 'Read', 'Read a.md'],
  [[{ type: 'listFiles', command: 'ls', path: '/vault/folder' }], 'List', 'Listed folder'],
  [[{ type: 'listFiles', command: 'ls', path: null }], 'List', 'Listed files'],
  [[{ type: 'search', command: 'rg topic', query: 'topic', path: null }], 'Search', 'Searched for topic'],
  [[{ type: 'search', command: 'rg', query: null, path: null }], 'Shell', 'Ran rg'],
  [[{ type: 'unknown', command: 'echo /vault/a' }], 'Shell', 'Ran echo a'],
  [[], 'Shell', 'Ran combined a'],
  [[{ type: 'unknown', command: 'one' }, { type: 'unknown', command: 'two' }], 'Shell', 'Ran combined a'],
])('normalizes command actions %j', (commandActions, name, title) => {
  const adapter = new CodexToolAdapter('/vault', []);
  expect([...adapter.events({ item: { type: 'commandExecution', id: 'i', command: 'combined /vault/a', commandActions, status: 'completed' }, phase: 'completed' })][0]).toEqual({
    type: 'tool', id: 'i', name, title, status: 'done',
  });
});

it('ignores non-tool items', () => {
  const adapter = new CodexToolAdapter('/vault', []);
  for (const item of [{ type: 'reasoning', id: 'i' }, { type: 'other', id: 'i' }, { type: 'agentMessage', id: 'i', text: 'hello' }] as const) {
    expect([...adapter.events({ item, phase: 'started' })]).toEqual([]);
  }
});
