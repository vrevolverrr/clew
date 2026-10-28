import { CodexModelAdapter } from '@/agents/codex/CodexModelAdapter';
import type { CodexModel, ThreadStartResult } from '@/agents/codex/codexProtocol';
import type { AgentModelAdapter } from '@/agents/adapters';

type NativeDefaults = Pick<ThreadStartResult, 'model' | 'reasoningEffort'>;

const rows: CodexModel[] = [
  { id: 'old', displayName: 'GPT-1.9-Family', supportedReasoningEfforts: [], defaultReasoningEffort: 'low', isDefault: true },
  { id: 'new', displayName: 'GPT-1.10-Family', supportedReasoningEfforts: [{ reasoningEffort: 'high' }, { reasoningEffort: 'max' }], defaultReasoningEffort: 'high', isDefault: false },
  { id: 'alias', displayName: 'Native alias', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }], defaultReasoningEffort: 'medium', isDefault: false },
];
const create = (defaults: NativeDefaults = { model: 'old', reasoningEffort: null }, probe = jest.fn(async () => defaults)): AgentModelAdapter =>
  new CodexModelAdapter(async () => ({ data: rows, nextCursor: null }), probe);
const expected = [
  { id: 'new', name: 'Family', efforts: ['high', 'max'], isDefault: true },
  { id: 'alias', name: 'Native alias', efforts: ['medium'], isDefault: false },
];

it('normalizes versions, older defaults and unfamiliar names', async () => {
  expect(await create().listModels()).toEqual(expected);
});

it('fetches every native page in cursor order', async () => {
  const request = jest.fn()
    .mockResolvedValueOnce({ data: rows.slice(0, 1), nextCursor: 'second' })
    .mockResolvedValueOnce({ data: rows.slice(1), nextCursor: null });
  const adapter: AgentModelAdapter = new CodexModelAdapter(request, async () => ({ model: 'old' }));
  expect(await adapter.listModels()).toEqual(expected);
  expect(request.mock.calls).toEqual([[null], ['second']]);
});

it('resolves each explicit model effort and the catalogue default for the config model', async () => {
  expect(await create({ model: 'alias' }).setModel('new')).toEqual({ model: 'new', effort: 'high' });
  expect(await create().setModel()).toEqual({ model: 'old', effort: 'low' });
  expect(await create().setModel('new', 'max')).toEqual({ model: 'new', effort: 'max' });
});

describe('Auto follows config.toml', () => {
  it('(a) takes the config model', async () => {
    expect(await create({ model: 'alias' }).setModel()).toEqual({ model: 'alias', effort: 'medium' });
  });

  it('(b) takes the config effort when the model lists it', async () => {
    expect(await create({ model: 'new', reasoningEffort: 'max' }).setModel()).toEqual({ model: 'new', effort: 'max' });
    expect(await create({ model: 'old', reasoningEffort: 'max' }).setModel('new')).toEqual({ model: 'new', effort: 'max' });
  });

  it('(c) falls back to the model default when the model does not list the config effort', async () => {
    expect(await create({ model: 'alias', reasoningEffort: 'max' }).setModel()).toEqual({ model: 'alias', effort: 'medium' });
  });

  it('(d) uses the model default when the config sets no effort', async () => {
    expect(await create({ model: 'new', reasoningEffort: null }).setModel()).toEqual({ model: 'new', effort: 'high' });
  });

  it('(e) never probes when model and effort are both chosen', async () => {
    const probe = jest.fn(async () => ({ model: 'alias' }));
    await create(undefined, probe).setModel('new', 'max');
    expect(probe).not.toHaveBeenCalled();
  });

  it('(f) marks the config model\'s family as default', async () => {
    expect(await create({ model: 'alias' }).listModels()).toEqual([
      { id: 'new', name: 'Family', efforts: ['high', 'max'], isDefault: false },
      { id: 'alias', name: 'Native alias', efforts: ['medium'], isDefault: true },
    ]);
  });

  it('(g) marks the catalogue default when the config model is not in the catalogue', async () => {
    expect(await create({ model: 'missing' }).listModels()).toEqual(expected);
  });
});

it('preserves empty catalogue and unknown-model fallbacks', async () => {
  const empty: AgentModelAdapter = new CodexModelAdapter(async () => ({ data: [], nextCursor: null }), async () => ({ model: 'config' }));
  expect(await empty.listModels()).toEqual([]);
  expect(await empty.setModel()).toEqual({ model: 'config', effort: undefined });
  expect(await create().setModel('unknown')).toEqual({ model: 'unknown', effort: undefined });
});
