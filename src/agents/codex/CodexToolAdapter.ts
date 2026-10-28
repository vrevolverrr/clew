import { type AgentToolAdapter, type AgentToolCall, type AgentToolResult, displayCommand, displayPath, runTool, titleOf } from '@/agents/adapters';
import type { AgentEvent, AgentTool } from '@/agents/types';
import type { CommandAction, DynamicToolCallParams, DynamicToolCallResponse, ThreadItem } from './codexProtocol';

export interface CodexToolEvent {
  item: ThreadItem;
  phase: 'started' | 'completed';
}

export class CodexToolAdapter implements AgentToolAdapter<CodexToolEvent> {
  constructor(private readonly cwd: string, private readonly custom: readonly AgentTool[]) {}

  registration(): { dynamicTools?: ReturnType<typeof toolSpec>[] } {
    return this.custom.length ? { dynamicTools: this.custom.map(toolSpec) } : {};
  }

  run(call: AgentToolCall): Promise<AgentToolResult> {
    return runTool(this.custom, call);
  }

  async reply(params: DynamicToolCallParams): Promise<DynamicToolCallResponse> {
    const result = await this.run({ name: params.tool, input: params.arguments });
    return { contentItems: [{ type: 'inputText', text: result.text }], success: result.success };
  }

  *events({ item, phase }: CodexToolEvent): Generator<Extract<AgentEvent, { type: 'tool' }>> {
    const tool = toolOf(item, this.cwd, this.custom);
    if (!tool) return;
    const failed = 'status' in item && (item.status === 'failed' || item.status === 'declined');
    yield { type: 'tool', id: item.id, ...tool, status: phase === 'started' ? 'running' : failed ? 'failed' : 'done' };
  }
}

function toolSpec(tool: AgentTool): { type: 'function'; name: string; description: string; inputSchema: object } {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    inputSchema: { type: 'object', properties: { [tool.argument.name]: { type: 'string', enum: tool.argument.values } }, required: [tool.argument.name], additionalProperties: false },
  };
}

function toolOf(item: ThreadItem, cwd: string, custom: readonly AgentTool[] = []): { name: string; title: string } | null {
  switch (item.type) {
    case 'commandExecution': {
      const [action, ...rest] = item.commandActions;
      return action && rest.length === 0
        ? commandActionTool(action, cwd)
        : { name: 'Shell', title: `Ran ${displayCommand(item.command, cwd)}` };
    }
    case 'fileChange': return { name: 'Edit', title: `Edited ${item.changes.map((change) => displayPath(change.path, cwd)).join(', ')}` };
    case 'dynamicToolCall': return { name: item.tool, title: titleOf(custom, item.tool, item.arguments) ?? `Used ${item.tool}` };
    case 'mcpToolCall': return { name: item.tool, title: `Used ${item.tool}` };
    case 'webSearch': return { name: 'WebSearch', title: `Searched the web for ${item.query}` };
    case 'imageView': return { name: 'ViewImage', title: `Viewed ${displayPath(item.path, cwd)}` };
    default: return null;
  }
}

function commandActionTool(action: CommandAction, cwd: string): { name: string; title: string } {
  switch (action.type) {
    case 'read': return { name: 'Read', title: `Read ${displayPath(action.path, cwd)}` };
    case 'listFiles': return { name: 'List', title: action.path ? `Listed ${displayPath(action.path, cwd)}` : 'Listed files' };
    case 'search': if (action.query) return { name: 'Search', title: `Searched for ${action.query}` };
  }
  return { name: 'Shell', title: `Ran ${displayCommand(action.command, cwd)}` };
}
