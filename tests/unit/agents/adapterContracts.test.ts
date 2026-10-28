import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentModelAdapter, AgentPermissionAdapter, AgentToolAdapter } from '@/agents/adapters';
import { ClaudeModelAdapter } from '@/agents/claude/ClaudeModelAdapter';
import { ClaudePermissionAdapter } from '@/agents/claude/ClaudePermissionAdapter';
import { ClaudeToolAdapter } from '@/agents/claude/ClaudeToolAdapter';
import { CodexModelAdapter } from '@/agents/codex/CodexModelAdapter';
import { CodexPermissionAdapter } from '@/agents/codex/CodexPermissionAdapter';
import { CodexToolAdapter } from '@/agents/codex/CodexToolAdapter';
import type { AgentEvent, AgentTool } from '@/agents/types';

const models: Array<[string, () => AgentModelAdapter]> = [
  ['claude', () => new ClaudeModelAdapter({
    supportedModels: async () => [
      { value: 'default', displayName: 'Default', description: '', resolvedModel: 'native' },
      { value: 'model', displayName: 'Family 1', description: '', resolvedModel: 'native', supportedEffortLevels: ['low', 'high'] },
    ],
    setModel: async () => {}, applyFlagSettings: async () => {},
  })],
  ['codex', () => new CodexModelAdapter(async () => ({
    data: [{ id: 'model', displayName: 'GPT-1-Family', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }], defaultReasoningEffort: 'low', isDefault: true }],
    nextCursor: null,
  }), async () => ({ model: 'model' }))],
];

describe.each(models)('%s model contract', (_name, create) => {
  it('returns normalized model options from its native source', async () => {
    const adapter: AgentModelAdapter = create();
    expect(await adapter.listModels()).toEqual([{ id: 'model', name: 'Family', efforts: ['low', 'high'], isDefault: true }]);
  });

  it('accepts the same model/effort choice and returns a normalized selection', async () => {
    const adapter: AgentModelAdapter = create();
    expect(await adapter.setModel('model', 'high')).toEqual({ model: 'model', effort: 'high' });
  });
});

const tool: AgentTool = {
  name: 'lookup', description: 'Look up a pack', argument: { name: 'name', values: ['plot'] },
  run: (name) => 'Pack: ' + name, title: (name) => 'Loaded ' + name,
};
const tools: Array<[string, () => AgentToolAdapter<never>]> = [
  ['claude', () => new ClaudeToolAdapter('/vault', [tool])],
  ['codex', () => new CodexToolAdapter('/vault', [tool])],
];

describe.each(tools)('%s tool execution contract', (_name, create) => {
  it('uses common call and result shapes for success, absent arguments and unknown tools', async () => {
    const adapter = create();
    expect(await adapter.run({ name: 'lookup', input: { name: 'plot' } })).toEqual({ text: 'Pack: plot', success: true });
    expect(await adapter.run({ name: 'lookup', input: null })).toEqual({ text: 'Pack: ', success: true });
    expect(await adapter.run({ name: 'missing', input: {} })).toEqual({ text: 'No tool named missing.', success: false });
  });
});

function checkActivity<Native>(adapter: AgentToolAdapter<Native>, start: Native, end: Native): void {
  expect([...adapter.events(start)]).toEqual([{ type: 'tool', id: 'call', name: 'lookup', title: 'Loaded plot', status: 'running' }]);
  expect([...adapter.events(end)]).toEqual([{ type: 'tool', id: 'call', name: 'lookup', title: 'Loaded plot', status: 'done' }]);
}

it('normalizes different native activity through one event consumer', () => {
  checkActivity(new ClaudeToolAdapter('/vault', [tool]), {
    type: 'assistant', parent_tool_use_id: null,
    message: { content: [{ type: 'tool_use', id: 'call', name: 'mcp__clew__lookup', input: { name: 'plot' } }] },
  } as SDKMessage, {
    type: 'user', parent_tool_use_id: null,
    message: { content: [{ type: 'tool_result', tool_use_id: 'call', content: 'Pack: plot' }] },
  } as SDKMessage);
  const item = { type: 'dynamicToolCall' as const, id: 'call', tool: 'lookup', arguments: { name: 'plot' }, status: 'completed' as const };
  checkActivity(new CodexToolAdapter('/vault', [tool]), { item, phase: 'started' }, { item, phase: 'completed' });
});

type Approval = Extract<AgentEvent, { type: 'approval' }>;

function permissionContract<Native>(name: string, create: () => { adapter: AgentPermissionAdapter<Native>; native: Native }): void {
  describe(name + ' permission contract', () => {
    it.each([true, false])('emits normalized approval data and returns decision=%s', async (approved) => {
      const { adapter, native } = create();
      let event: Approval | undefined;
      const pending = adapter.request(native, { signal: new AbortController().signal, push: (next) => { event = next as Approval; } });
      expect(event?.request.fields).toEqual([{ kind: 'command', value: 'echo hello' }]);
      expect(event?.request.decisionReason).toBe('Needs permission');
      event!.answer(approved);
      expect(await pending).toBe(approved);
    });

    it('cancels the request and ignores a late affirmative answer', async () => {
      const { adapter, native } = create();
      const controller = new AbortController();
      let event: Approval | undefined;
      const pending = adapter.request(native, { signal: controller.signal, push: (next) => { event = next as Approval; } });
      expect(event).toBeDefined();
      controller.abort();
      event!.answer(true);
      expect(await pending).toBe(false);
      expect(event!.signal.aborted).toBe(true);
    });
  });
}

permissionContract('claude', () => ({
  adapter: new ClaudePermissionAdapter(),
  native: { tool: 'Bash', input: { command: 'echo hello' }, reason: 'Needs permission' },
}));
permissionContract('codex', () => ({
  adapter: new CodexPermissionAdapter({ thread: {} }, () => undefined),
  native: { id: 'request', method: 'item/commandExecution/requestApproval', params: {
    threadId: 'thread', turnId: 'turn', itemId: 'item', command: 'echo hello', reason: 'Needs permission',
  } },
}));
