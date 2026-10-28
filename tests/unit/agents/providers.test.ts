import { AGENT_IDS, createAgents, DEFAULT_AGENT, isAgentId } from '@/agents/providers';
import { resolveLoginShellPath } from '@/agents/process/loginShellPath';

jest.mock('@/agents/process/loginShellPath', () => ({ resolveLoginShellPath: jest.fn(async () => undefined) }));

it('constructs the adapter matching every registered identity without starting a session', () => {
  const env = jest.fn(() => ({}));
  const agents = createAgents(env);
  expect(Object.keys(agents)).toEqual([...AGENT_IDS]);
  for (const id of AGENT_IDS) expect(agents[id].id).toBe(id);
  expect(env).not.toHaveBeenCalled();
  expect(resolveLoginShellPath).toHaveBeenCalled();
});

it.each(AGENT_IDS)('accepts the registered provider %s', (id) => {
  expect(isAgentId(id)).toBe(true);
});

it('uses a registered default provider', () => {
  expect(AGENT_IDS).toContain(DEFAULT_AGENT);
});

it.each([
  'unknown', '', 'constructor', 'toString', '__proto__',
  undefined, null, 0, true, {}, ['claude'],
])('rejects an unregistered identity: %j', (value) => {
  expect(isAgentId(value)).toBe(false);
});
