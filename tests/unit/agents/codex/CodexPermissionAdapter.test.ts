import { CodexPermissionAdapter, type CodexApprovalRequest } from '@/agents/codex/CodexPermissionAdapter';
import type { AgentEvent } from '@/agents/types';

it('emits normalized file changes while retaining native input for inspection', async () => {
  const events: Approval[] = [];
  const item = { changes: [{ path: 'note.md', kind: { type: 'update' }, diff: '-before\n+after\n' }] };
  const adapter = new CodexPermissionAdapter({ thread: {} }, () => item);
  const pending = adapter.reply(1, 'item/fileChange/requestApproval', { ...request, reason: 'Update the note' }, {
    signal: new AbortController().signal,
    push: (event) => events.push(event as Approval),
  });
  expect(events[0]?.request).toEqual({
    description: 'these file changes', decisionReason: 'Update the note', input: { command: 'echo hello', item },
    fields: [{ kind: 'command', value: 'echo hello' }],
    changes: [{ path: 'note.md', kind: 'update', blocks: [{ before: 'before\n', after: 'after\n' }] }],
  });
  events[0]!.answer(true);
  expect(await pending).toEqual({ decision: 'accept' });
});

it('declines a request no running turn owns', async () => {
  const adapter = new CodexPermissionAdapter({ thread: {} }, () => undefined);
  expect(await adapter.reply(1, method, request, undefined)).toEqual({ decision: 'decline' });
});

const request = { threadId: 'thread', turnId: 'turn', itemId: 'command', command: 'echo hello' };
const method = 'item/commandExecution/requestApproval';

const nativeDefaults = {
  thread: { id: 'fresh' }, model: 'native-model', approvalPolicy: 'on-request', approvalsReviewer: 'user',
  sandbox: { type: 'workspaceWrite', writableRoots: ['/vault'], networkAccess: false, excludeTmpdirEnvVar: true },
};

it('restores every native sandbox field on resumed Inherit', async () => {
  const probe = jest.fn().mockResolvedValue(nativeDefaults);
  const prepared = await CodexPermissionAdapter.prepare('inherit', 'saved', probe);
  expect(probe).toHaveBeenCalledTimes(1);
  expect(prepared.thread).toEqual({ approvalPolicy: 'on-request', approvalsReviewer: 'user' });
  const adapter = new CodexPermissionAdapter(prepared, () => undefined);
  expect(adapter.turnSettings()).toEqual({ sandboxPolicy: nativeDefaults.sandbox });
});

it.each([undefined, 'inherit'] as const)('does not probe fresh native defaults for %s', async (policy) => {
  const probe = jest.fn();
  const prepared = await CodexPermissionAdapter.prepare(policy, undefined, probe);
  expect(probe).not.toHaveBeenCalled();
  expect(prepared.thread).toEqual({});
  expect(new CodexPermissionAdapter(prepared, () => undefined).turnSettings()).toEqual({});
});

it.each([
  ['approval', { approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'workspace-write' }],
  ['auto', { approvalPolicy: 'on-request', approvalsReviewer: 'auto_review', sandbox: 'workspace-write' }],
  ['bypass', { approvalPolicy: 'never', approvalsReviewer: 'user', sandbox: 'danger-full-access' }],
] as const)('encodes explicit %s without probing even on resume', async (policy, settings) => {
  const probe = jest.fn();
  expect((await CodexPermissionAdapter.prepare(policy, 'saved', probe)).thread).toEqual(settings);
  expect(probe).not.toHaveBeenCalled();
});

it.each(['approvalPolicy', 'approvalsReviewer', 'sandbox'] as const)('rejects missing inherited %s', async (field) => {
  const missing = { ...nativeDefaults, [field]: undefined };
  await expect(CodexPermissionAdapter.prepare('inherit', 'saved', async () => missing))
    .rejects.toThrow('did not report its native permission defaults');
});

it('requires confirmation of automatic review', () => {
  expect(() => CodexPermissionAdapter.confirm('auto', nativeDefaults)).toThrow('did not enable automatic approval review');
  expect(() => CodexPermissionAdapter.confirm('auto', { ...nativeDefaults, approvalsReviewer: 'auto_review' })).not.toThrow();
});

it('keeps identical request IDs and withdrawals independent between sessions', async () => {
  const first = setup();
  const second = setup();
  const a = first.router.handle('same', method, request);
  const b = second.router.handle('same', method, request);
  let secondSettled = false;
  void b.then(() => { secondSettled = true; });
  first.router.resolved('thread', 'same');
  expect(await a).toEqual({ decision: 'decline' });
  expect(secondSettled).toBe(false);
  expect(second.events[0]!.signal.aborted).toBe(false);
  second.events[0]!.answer(true);
  expect(await b).toEqual({ decision: 'accept' });
});

it('preserves nonempty additional permissions with turn-only scope', async () => {
  const { router, events } = setup();
  const permissions = { network: { enabled: true }, fileSystem: { write: ['/outside'] } };
  const pending = router.handle('grant', 'item/permissions/requestApproval', { ...request, permissions });
  expect(events[0]!.request.fields).toContainEqual({ kind: 'permissions', value: JSON.stringify(permissions, null, 2) });
  events[0]!.answer(true);
  expect(await pending).toEqual({ permissions, scope: 'turn' });
});

type Approval = Extract<AgentEvent, { type: 'approval' }>;

function setup(answer?: boolean) {
  const events: Approval[] = [];
  const adapter = new CodexPermissionAdapter({ thread: {} }, () => undefined);
  const turn = {
    signal: new AbortController().signal,
    push: (event: AgentEvent) => {
      events.push(event as Approval);
      if (answer !== undefined) (event as Approval).answer(answer);
    },
  };
  const router = {
    handle: (id: string | number, method: string, params: CodexApprovalRequest) => adapter.reply(id, method, params, turn),
    resolved: (threadId: string, id: string | number) => adapter.resolved(threadId, id),
  };
  return { router, events };
}

it('distinguishes string and numeric native request ids', async () => {
  const { router, events } = setup(true);
  expect(await Promise.all([router.handle(1, method, request), router.handle('1', method, request)])).toEqual([{ decision: 'accept' }, { decision: 'accept' }]);
  expect(events).toHaveLength(2);
});

it('declines a repeated native id while the first is open', async () => {
  const { router, events } = setup();
  const first = router.handle(1, method, request);
  expect(await router.handle(1, method, request)).toEqual({ decision: 'decline' });
  events[0]!.answer(true);
  expect(await first).toEqual({ decision: 'accept' });
});

it('does not upgrade Approve into a session grant when native choices exclude accept-once', async () => {
  const { router, events } = setup(true);
  expect(await router.handle(1, method, { ...request, availableDecisions: ['acceptForSession', 'decline'] })).toEqual({ decision: 'decline' });
  expect(events).toHaveLength(0);
});

it('withdraws only the request with the matching thread and typed native id', async () => {
  const { router, events } = setup();
  const result = router.handle(1, method, request);
  router.resolved('another-thread', 1);
  router.resolved('thread', '1');
  expect(events[0]!.signal.aborted).toBe(false);
  router.resolved('thread', 1);
  expect(events[0]!.signal.aborted).toBe(true);
  events[0]!.answer(true);
  expect(await result).toEqual({ decision: 'decline' });
});

describe('requestUserInput', () => {
  type Question = Extract<AgentEvent, { type: 'question' }>;
  const params = { threadId: 'thread', turnId: 'turn', questions: [
    { id: 'q1', header: 'Mode', question: 'Which mode?', isOther: false, isSecret: false, options: [{ label: 'Fast', description: '' }] },
    { id: 'q2', header: 'Key', question: 'Your token?', isOther: false, isSecret: true, options: null },
  ] };

  it('asks the student and answers by question id', async () => {
    const events: Question[] = [];
    const adapter = new CodexPermissionAdapter({ thread: {} }, () => undefined);
    const pending = adapter.answer(7, params, { signal: new AbortController().signal, push: (event) => events.push(event as Question) });
    expect(events[0]!.questions).toEqual([
      { header: 'Mode', question: 'Which mode?', options: [{ label: 'Fast', description: '' }], multiSelect: false, other: false, secret: false },
      { header: 'Key', question: 'Your token?', options: [], multiSelect: false, other: true, secret: true },
    ]);
    events[0]!.answer([['Fast'], ['abc']]);
    expect(await pending).toEqual({ answers: { q1: { answers: ['Fast'] }, q2: { answers: ['abc'] } } });
  });

  it('answers nothing when skipped, withdrawn, or owned by no turn', async () => {
    const adapter = new CodexPermissionAdapter({ thread: {} }, () => undefined);
    expect(await adapter.answer(1, params, undefined)).toEqual({ answers: {} });
    const events: Question[] = [];
    const turn = { signal: new AbortController().signal, push: (event: AgentEvent) => events.push(event as Question) };
    const skipped = adapter.answer(2, params, turn);
    events[0]!.answer(undefined);
    expect(await skipped).toEqual({ answers: {} });
    const withdrawn = adapter.answer(3, params, turn);
    adapter.resolved('thread', 3);
    events[1]!.answer([['Fast'], ['late']]);
    expect(await withdrawn).toEqual({ answers: {} });
  });
});
