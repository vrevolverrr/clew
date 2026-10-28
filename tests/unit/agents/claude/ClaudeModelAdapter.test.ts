import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeModelAdapter } from '@/agents/claude/ClaudeModelAdapter';
import type { AgentModelAdapter } from '@/agents/adapters';

it('maps an older default onto the latest family and retains unfamiliar names', async () => {
  const rows: ModelInfo[] = [
    { value: 'default', displayName: 'Default', description: '', resolvedModel: 'old' },
    { value: 'old-id', displayName: 'Family 1.9', description: '', resolvedModel: 'old' },
    { value: 'new-id', displayName: 'Family 1.10', description: '', supportedEffortLevels: ['low', 'high'] },
    { value: 'odd', displayName: 'Custom alias', description: '' },
  ];
  const adapter: AgentModelAdapter = new ClaudeModelAdapter({
    supportedModels: async () => rows, setModel: jest.fn(), applyFlagSettings: jest.fn(),
  });
  expect(await adapter.listModels()).toEqual([
    { id: 'new-id', name: 'Family', efforts: ['low', 'high'], isDefault: true },
    { id: 'odd', name: 'Custom alias', efforts: [], isDefault: false },
  ]);
});

it('preserves omitted startup choices and clears effort with null', async () => {
  const controls: unknown[] = [];
  const adapter: AgentModelAdapter = new ClaudeModelAdapter({
    supportedModels: async () => [],
    setModel: async (model) => { controls.push({ model }); },
    applyFlagSettings: async (settings) => { controls.push(settings); },
  });
  expect(await adapter.setModel('opus', 'high')).toEqual({ model: 'opus', effort: 'high' });
  expect(await adapter.setModel()).toEqual({ model: undefined, effort: undefined });
  expect(controls).toEqual([{ model: 'opus' }, { effortLevel: 'high' }, { model: undefined }, { effortLevel: null }]);
  expect(await adapter.listModels()).toEqual([]);
});
