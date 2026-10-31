import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type * as ClaudeSDK from '@anthropic-ai/claude-agent-sdk/core';
import { ClaudeToolAdapter } from '@/agents/claude/ClaudeToolAdapter';
import type { AgentTool } from '@/agents/types';

const custom: AgentTool = {
  name: 'lookup', description: 'Look up a pack', argument: { name: 'name', values: ['plot', 'grid'] },
  run: (name) => 'Pack: ' + name, title: (name) => 'Loaded ' + name,
};
const message = (type: 'assistant' | 'user', content: unknown, parent: string | null = null): SDKMessage =>
  ({ type, parent_tool_use_id: parent, message: { content } } as SDKMessage);
const call = (name: string, input: object, id = 'call') => message('assistant', [{ type: 'tool_use', id, name, input }]);
const result = (id = 'call', failed = false) => message('user', [{ type: 'tool_result', tool_use_id: id, is_error: failed }]);

it('builds the MCP enum schema, allow-list and executable result', async () => {
  const tool = jest.fn((_name: string, _description: string, _schema: unknown, run: (args: unknown) => Promise<unknown>) => ({ run }));
  const server = { type: 'sdk', name: 'clew' };
  const createSdkMcpServer = jest.fn(() => server);
  const sdk = { tool, createSdkMcpServer } as unknown as Pick<typeof ClaudeSDK, 'tool' | 'createSdkMcpServer'>;
  const registration = await ClaudeToolAdapter.createServer([custom], sdk, new ClaudeToolAdapter('/vault', [custom]));
  expect(registration).toEqual({ mcpServers: { clew: server }, allowedTools: ['mcp__clew__lookup'] });
  expect(createSdkMcpServer).toHaveBeenCalledWith({ name: 'clew', version: '1.0.0', tools: [{ run: expect.any(Function) }] });
  expect(tool.mock.calls[0]!.slice(0, 2)).toEqual(['lookup', 'Look up a pack']);
  const schema = tool.mock.calls[0]![2] as { name: { safeParse(value: unknown): { success: boolean } } };
  expect(schema.name.safeParse('plot').success).toBe(true);
  expect(schema.name.safeParse('unknown').success).toBe(false);
  expect(await tool.mock.calls[0]![3]({ name: 'plot' })).toEqual({ content: [{ type: 'text', text: 'Pack: plot' }] });
});

it('correlates native results, suppresses duplicate starts and ignores unknown results', () => {
  const adapter = new ClaudeToolAdapter('/vault', []);
  expect([...adapter.events(result('unknown'))]).toEqual([]);
  expect([...adapter.events(call('Read', { file_path: '/vault/notes.md' }))]).toEqual([
    { type: 'tool', id: 'call', name: 'Read', title: 'Read notes.md', status: 'running' },
  ]);
  expect([...adapter.events(call('Read', { file_path: '/vault/notes.md' }))]).toEqual([]);
  expect([...adapter.events(result('call', true))]).toEqual([
    { type: 'tool', id: 'call', name: 'Read', title: 'Read notes.md', status: 'failed' },
  ]);
  expect([...adapter.events(result())]).toEqual([]);
});

it('does not apply Clew custom titles to other MCP servers', () => {
  const adapter = new ClaudeToolAdapter('/vault', [custom]);
  expect([...adapter.events(call('mcp__other__lookup', { name: 'plot' }, 'other'))][0]).toMatchObject({ title: 'Used lookup' });
});

it('ignores subagent messages and non-array content without contaminating another session', () => {
  const first = new ClaudeToolAdapter('/vault', []);
  const second = new ClaudeToolAdapter('/vault', []);
  expect([...first.events(message('assistant', [{ type: 'tool_use', id: 'call', name: 'Read', input: {} }], 'parent'))]).toEqual([]);
  expect([...first.events(message('user', 'plain text'))]).toEqual([]);
  expect([...first.events(call('Read', { file_path: '/vault/a.md' }))]).toHaveLength(1);
  expect([...second.events(result())]).toEqual([]);
  expect([...second.events(call('Read', { file_path: '/vault/b.md' }))][0]).toMatchObject({ title: 'Read b.md' });
});
