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

it('declines idle and structured-question requests without emitting approvals', async () => {
  const idle = nativeAdapter(() => undefined);
  expect(await idle.canUseTool('Edit', {}, nativeOptions())).toMatchObject({ behavior: 'deny', interrupt: true });
  const push = jest.fn();
  const active = nativeAdapter(() => ({ signal: new AbortController().signal, push }));
  expect(await active.canUseTool('AskUserQuestion', {}, nativeOptions())).toEqual({ behavior: 'deny', message: 'Ask the student your question in the chat instead.' });
  expect(push).not.toHaveBeenCalled();
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
