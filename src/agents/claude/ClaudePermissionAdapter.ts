import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { type AgentApprovalContext, type AgentPermissionAdapter, askApproval } from '@/agents/adapters';
import type { PermissionPolicy } from '@/agents/types';
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
      if (toolName === 'AskUserQuestion') return { behavior: 'deny', message: 'Ask the student your question in the chat instead.' };
      const signal = AbortSignal.any([turn.signal, options.signal]);
      const approved = await this.request({ tool: toolName, input, reason: options.decisionReason }, { ...turn, signal });
      return approved
        ? { behavior: 'allow', updatedInput: input, decisionClassification: 'user_temporary' }
        : { behavior: 'deny', message: signal.aborted ? 'Permission request cancelled.' : 'The student declined this action.', interrupt: signal.aborted };
    };
  }
}
