import { type AgentApprovalContext, type AgentPermissionAdapter, askApproval, askQuestions } from '@/agents/adapters';
import type { AgentQuestion, PermissionPolicy } from '@/agents/types';
import type { ThreadStartResult } from './codexProtocol';
import { codexToolApproval } from './codexToolApproval';

export interface CodexApprovalRequest extends Record<string, unknown> {
  threadId: string;
  turnId: string;
  itemId: string;
  reason?: string | null;
  command?: string | null;
  permissions?: Record<string, unknown>;
  networkApprovalContext?: { host: string; protocol: string } | null;
  availableDecisions?: unknown[] | null;
}

const COMMAND = 'item/commandExecution/requestApproval';
const DECISION = { denied: { decision: 'decline' }, accepted: () => ({ decision: 'accept' }) };
const METHODS: Record<string, { description: string; denied: unknown; accepted: (request: CodexApprovalRequest) => unknown }> = {
  [COMMAND]: { description: 'this command', ...DECISION },
  'item/fileChange/requestApproval': { description: 'these file changes', ...DECISION },
  'item/permissions/requestApproval': {
    description: 'this additional access',
    denied: { permissions: {}, scope: 'turn' },
    accepted: (request) => ({ permissions: request.permissions ?? {}, scope: 'turn' }),
  },
};

export const CODEX_APPROVAL_METHODS = Object.keys(METHODS);

export const CODEX_QUESTION_METHOD = 'item/tool/requestUserInput';

export interface CodexQuestionRequest {
  threadId: string;
  turnId: string;
  questions: { id: string; header: string; question: string; isOther: boolean; isSecret: boolean; options: { label: string; description: string }[] | null }[];
}

/** Adapted from Claudian's CodexExecutionServerRequestRouter, retaining once-only decisions. */
export interface CodexPermissionSetup {
  thread: {
    approvalPolicy?: ThreadStartResult['approvalPolicy'];
    approvalsReviewer?: string;
    sandbox?: 'workspace-write' | 'danger-full-access';
  };
  inheritedSandbox?: ThreadStartResult['sandbox'];
}

export interface CodexPermissionInput {
  id: string | number;
  method: string;
  params: CodexApprovalRequest;
}

export class CodexPermissionAdapter implements AgentPermissionAdapter<CodexPermissionInput> {
  /** Open requests by native id, so Codex can withdraw one and a repeated id is declined. */
  private readonly pending = new Map<string, AbortController>();

  constructor(
    private readonly setup: CodexPermissionSetup,
    private readonly itemFor: (itemId: string) => unknown,
  ) {}

  /** A saved rollout retains overrides, so resumed Inherit restores fresh native defaults. */
  static async prepare(policy: PermissionPolicy | undefined, resume: string | undefined, probe: () => Promise<ThreadStartResult>): Promise<CodexPermissionSetup> {
    const inherited = resume && (!policy || policy === 'inherit') ? await probe() : undefined;
    if (inherited && (!inherited.approvalPolicy || !inherited.approvalsReviewer || !inherited.sandbox)) {
      throw new Error('Codex did not report its native permission defaults. Update Codex before resuming with Inherit.');
    }
    const thread: CodexPermissionSetup['thread'] = policy === 'bypass'
      ? { approvalPolicy: 'never', approvalsReviewer: 'user', sandbox: 'danger-full-access' }
      : policy === 'auto' || policy === 'approval'
        ? { approvalPolicy: 'on-request', approvalsReviewer: policy === 'auto' ? 'auto_review' : 'user', sandbox: 'workspace-write' }
        : inherited ? { approvalPolicy: inherited.approvalPolicy, approvalsReviewer: inherited.approvalsReviewer } : {};
    return { thread, inheritedSandbox: inherited?.sandbox };
  }

  static confirm(policy: PermissionPolicy | undefined, opened: ThreadStartResult): void {
    if (policy === 'auto' && opened.approvalsReviewer !== 'auto_review') {
      throw new Error('Codex did not enable automatic approval review. Update Codex or choose Approval.');
    }
  }

  turnSettings(): { sandboxPolicy?: ThreadStartResult['sandbox'] } {
    return this.setup.inheritedSandbox ? { sandboxPolicy: this.setup.inheritedSandbox } : {};
  }

  async request({ id, method, params: request }: CodexPermissionInput, turn: AgentApprovalContext): Promise<boolean> {
    const { description } = METHODS[method]!;
    if (method === COMMAND && request.availableDecisions && !request.availableDecisions.includes('accept')) return false;
    const { threadId, turnId, itemId, reason, ...input } = request;
    const network = request.networkApprovalContext;
    const item = this.itemFor(itemId);
    return this.withdrawable(threadId, id, turn, false, (signal) => askApproval(turn.push, codexToolApproval(
      network ? `network access to ${network.host}` : description,
      item ? { ...input, item } : input,
      reason ?? undefined,
    ), signal));
  }

  /** The native reply to an approval request; one with no running turn is declined. */
  async reply(id: string | number, method: string, params: CodexApprovalRequest, turn: AgentApprovalContext | undefined): Promise<unknown> {
    const { denied, accepted } = METHODS[method]!;
    return turn && await this.request({ id, method, params }, turn) ? accepted(params) : denied;
  }

  /** The native reply to `item/tool/requestUserInput`; no answers declines it. */
  async answer(id: string | number, { threadId, questions }: CodexQuestionRequest, turn: AgentApprovalContext | undefined): Promise<{ answers: Record<string, { answers: string[] }> }> {
    if (!turn || !Array.isArray(questions) || !questions.length) return { answers: {} };
    const asked = questions.map((question): AgentQuestion => ({
      header: question.header, question: question.question, options: question.options ?? [],
      multiSelect: false, other: question.isOther || !question.options?.length, secret: question.isSecret,
    }));
    const answers = await this.withdrawable(threadId, id, turn, undefined, (signal) => askQuestions(turn.push, asked, signal));
    return { answers: answers ? Object.fromEntries(questions.map((question, index) => [question.id, { answers: [...answers[index]!] }])) : {} };
  }

  /** Runs `ask` under a signal that also ends when Codex withdraws the request; a repeated id gets `declined`. */
  private async withdrawable<T>(threadId: string, id: string | number, turn: AgentApprovalContext, declined: T, ask: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const key = this.nativeKey(threadId, id);
    if (this.pending.has(key)) return declined;
    const withdrawn = new AbortController();
    this.pending.set(key, withdrawn);
    try {
      return await ask(AbortSignal.any([turn.signal, withdrawn.signal]));
    } finally {
      this.pending.delete(key);
    }
  }

  resolved(threadId: string, requestId: string | number): void { this.pending.get(this.nativeKey(threadId, requestId))?.abort(); }

  private nativeKey(threadId: string, requestId: string | number): string { return `${threadId}\u0000${typeof requestId}:${requestId}`; }
}
