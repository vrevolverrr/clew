import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { type AgentApprovalContext, type AgentPermissionAdapter, askApproval, askQuestions } from '@/agents/adapters';
import type { AgentQuestion, PermissionPolicy } from '@/agents/types';
import { claudeToolApproval } from './claudeToolApproval';

/** Native policy and once-only approval handling for one Claude session. */
export interface ClaudePermissionInput {
  tool: string;
  input: Record<string, unknown>;
  reason?: string;
}

export class ClaudePermissionAdapter implements AgentPermissionAdapter<ClaudePermissionInput> {
  static settings(policy?: PermissionPolicy): Pick<Options, 'permissionMode' | 'allowDangerouslySkipPermissions' | 'extraArgs'> {
    return {
      ...(policy && policy !== 'inherit' ? { permissionMode: policy === 'bypass' ? 'bypassPermissions' : policy === 'auto' ? 'auto' : 'default' } : {}),
      ...(policy === 'bypass' ? { allowDangerouslySkipPermissions: true } : {}),
      ...(policy === 'auto' ? { extraArgs: { 'enable-auto-mode': null } } : {}),
    };
  }

  request({ tool, input, reason }: ClaudePermissionInput, turn: AgentApprovalContext): Promise<boolean> {
    return askApproval(turn.push, claudeToolApproval(tool, input, reason), turn.signal);
  }

  /** The SDK's `canUseTool`, bound to the turn that owns each request. */
  callback(turnFor: () => AgentApprovalContext | undefined): NonNullable<Options['canUseTool']> {
    return async (toolName, input, options) => {
      const turn = turnFor();
      if (!turn || turn.signal.aborted) return { behavior: 'deny', message: 'No active turn owns this permission request.', interrupt: true };
      const signal = AbortSignal.any([turn.signal, options.signal]);
      if (toolName === 'AskUserQuestion') {
        const questions = claudeQuestions(input);
        if (!questions) return { behavior: 'deny', message: 'Ask the student your question in the chat instead.' };
        const answers = await askQuestions(turn.push, questions, signal);
        if (!answers) return { behavior: 'deny', message: signal.aborted ? 'Question cancelled.' : 'The student chose not to answer.', interrupt: signal.aborted };
        // Claude Code reads answers keyed by question text, several choices joined by commas.
        return { behavior: 'allow', updatedInput: { ...input, answers: Object.fromEntries(questions.map((question, index) => [question.question, answers[index]!.join(', ')])) } };
      }
      const approved = await this.request({ tool: toolName, input, reason: options.decisionReason }, { ...turn, signal });
      return approved
        ? { behavior: 'allow', updatedInput: input, decisionClassification: 'user_temporary' }
        : { behavior: 'deny', message: signal.aborted ? 'Permission request cancelled.' : 'The student declined this action.', interrupt: signal.aborted };
    };
  }
}

interface ClaudeQuestion {
  question: string;
  header?: unknown;
  options: { label: string; description?: unknown }[];
  multiSelect?: unknown;
}

function isQuestion(value: unknown): value is ClaudeQuestion {
  const question = value as Partial<Record<string, unknown>> | null;
  return typeof question === 'object' && question !== null && typeof question.question === 'string' && Array.isArray(question.options)
    && question.options.every((option: unknown) => typeof option === 'object' && option !== null && typeof (option as { label?: unknown }).label === 'string');
}

/** `AskUserQuestion`'s questions, or undefined when the input is not the shape Claude Code documents. */
function claudeQuestions({ questions }: Record<string, unknown>): AgentQuestion[] | undefined {
  if (!Array.isArray(questions) || !questions.length || !questions.every(isQuestion)) return undefined;
  return questions.map((question) => ({
    header: typeof question.header === 'string' ? question.header : '', question: question.question,
    options: question.options.map(({ label, description }) => ({ label, description: typeof description === 'string' ? description : '' })),
    multiSelect: question.multiSelect === true, other: true, secret: false,
  }));
}
