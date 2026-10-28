import { ClaudePermissionAdapter } from '@/agents/claude/ClaudePermissionAdapter';
import type { AgentApprovalContext } from '@/agents/adapters';
import type { AgentEvent } from '@/agents/types';

type Approval = Extract<AgentEvent, { type: 'approval' }>;
const nativeOptions = () => ({ toolUseID: 'tool', requestId: 'request', signal: new AbortController().signal });

function nativeAdapter(turnFor: () => AgentApprovalContext | undefined) {
  return { canUseTool: new ClaudePermissionAdapter().callback(turnFor) };
}

it('encodes explicit modes without overriding inherited settings', () => {
  expect(ClaudePermissionAdapter.settings()).toEqual({});
  expect(ClaudePermissionAdapter.settings('inherit')).toEqual({});
  expect(ClaudePermissionAdapter.settings('approval')).toEqual({ permissionMode: 'default' });
  expect(ClaudePermissionAdapter.settings('auto')).toEqual({ permissionMode: 'auto', extraArgs: { 'enable-auto-mode': null } });
  expect(ClaudePermissionAdapter.settings('bypass')).toEqual({ permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true });
});

it('declines a request no running turn owns', async () => {
  const idle = nativeAdapter(() => undefined);
  expect(await idle.canUseTool('Edit', {}, nativeOptions())).toMatchObject({ behavior: 'deny', interrupt: true });
});

describe('AskUserQuestion', () => {
  type Question = Extract<AgentEvent, { type: 'question' }>;
  const input = { questions: [
    { question: 'Which proof?', header: 'Proof', options: [{ label: 'Induction', description: 'On n' }, { label: 'Contradiction', description: '' }], multiSelect: false },
    { question: 'Which topics?', header: 'Topics', options: [{ label: 'Sets', description: '' }, { label: 'Maps', description: '' }], multiSelect: true },
  ] };
  const asking = () => {
    const events: Question[] = [];
    const adapter = nativeAdapter(() => ({ signal: new AbortController().signal, push: (event) => events.push(event as Question) }));
    return { events, pending: adapter.canUseTool('AskUserQuestion', input, nativeOptions()) };
  };

  it('asks the student and returns the answers keyed by question text', async () => {
    const { events, pending } = asking();
    expect(events[0]!.questions).toEqual([
      { header: 'Proof', question: 'Which proof?', options: [{ label: 'Induction', description: 'On n' }, { label: 'Contradiction', description: '' }], multiSelect: false, other: true, secret: false },
      { header: 'Topics', question: 'Which topics?', options: [{ label: 'Sets', description: '' }, { label: 'Maps', description: '' }], multiSelect: true, other: true, secret: false },
    ]);
    events[0]!.answer([['Induction'], ['Sets', 'my own']]);
    expect(await pending).toEqual({ behavior: 'allow', updatedInput: { ...input, answers: { 'Which proof?': 'Induction', 'Which topics?': 'Sets, my own' } } });
  });

  it('tells the agent when the student skips', async () => {
    const { events, pending } = asking();
    events[0]!.answer(undefined);
    expect(await pending).toEqual({ behavior: 'deny', message: 'The student chose not to answer.', interrupt: false });
  });

  it('declines input of an unknown shape without asking', async () => {
    const push = jest.fn();
    const adapter = nativeAdapter(() => ({ signal: new AbortController().signal, push }));
    expect(await adapter.canUseTool('AskUserQuestion', { questions: [{ question: 'Hm?' }] }, nativeOptions())).toMatchObject({ behavior: 'deny' });
    expect(push).not.toHaveBeenCalled();
  });
});

it.each([true, false])('normalizes a native edit and returns only a temporary decision: %s', async (approved) => {
  const events: Approval[] = [];
  const adapter = nativeAdapter(() => ({
    signal: new AbortController().signal, push: (event) => events.push(event as Approval),
  }));
  const input = { file_path: '/vault/note.md', old_string: 'before', new_string: 'after' };
  const pending = adapter.canUseTool('Edit', input, { ...nativeOptions(), decisionReason: 'Needs permission' });
  expect(events[0]!.request).toMatchObject({
    description: 'editing this file', decisionReason: 'Needs permission', input,
    changes: [{ path: '/vault/note.md', blocks: [{ before: 'before', after: 'after' }] }],
  });
  events[0]!.answer(approved);
  expect(await pending).toEqual(approved
    ? { behavior: 'allow', updatedInput: input, decisionClassification: 'user_temporary' }
    : { behavior: 'deny', message: 'The student declined this action.', interrupt: false });
});

it.each(['turn', 'native'] as const)('cancels through the %s signal and ignores a late allow', async (source) => {
  const turn = new AbortController();
  const native = new AbortController();
  let event: Approval | undefined;
  const adapter = nativeAdapter(() => ({ signal: turn.signal, push: (next) => { event = next as Approval; } }));
  const pending = adapter.canUseTool('Bash', { command: 'echo hello' }, { ...nativeOptions(), signal: native.signal });
  (source === 'turn' ? turn : native).abort();
  event!.answer(true);
  expect(await pending).toEqual({ behavior: 'deny', message: 'Permission request cancelled.', interrupt: true });
  expect(event!.signal.aborted).toBe(true);
});
