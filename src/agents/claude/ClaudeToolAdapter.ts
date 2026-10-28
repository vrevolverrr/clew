import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type * as ClaudeSDK from '@anthropic-ai/claude-agent-sdk/core';
import { z } from 'zod/v4';
import { type AgentToolAdapter, type AgentToolCall, type AgentToolResult, displayCommand, displayPath, runTool, titleOf } from '@/agents/adapters';
import type { AgentEvent, AgentTool } from '@/agents/types';

const TOOL_SERVER = 'clew';
/** The MCP server and the tool names that may run without asking. */
export type ClaudeTools = Pick<Options, 'mcpServers' | 'allowedTools'>;
export type ClaudeToolFactory = (tools: AgentTool[], adapter: AgentToolAdapter<SDKMessage>) => Promise<ClaudeTools>;

export class ClaudeToolAdapter implements AgentToolAdapter<SDKMessage> {
  private readonly tools = new Map<string, { name: string; title: string }>();

  constructor(private readonly cwd: string, private readonly custom: AgentTool[]) {}

  static async createServer(tools: AgentTool[], sdk: Pick<typeof ClaudeSDK, 'createSdkMcpServer' | 'tool'>, adapter: AgentToolAdapter<SDKMessage>): Promise<ClaudeTools> {
    const { createSdkMcpServer, tool } = sdk;
    const server = createSdkMcpServer({
      name: TOOL_SERVER,
      version: '1.0.0',
      tools: tools.map((agentTool) =>
        tool(agentTool.name, agentTool.description, { [agentTool.argument.name]: z.enum(agentTool.argument.values as [string, ...string[]]) }, async (args) => {
          const result = await adapter.run({ name: agentTool.name, input: args });
          return { content: [{ type: 'text' as const, text: result.text }], ...(result.success ? {} : { isError: true }) };
        }),
      ),
    });
    return { mcpServers: { [TOOL_SERVER]: server }, allowedTools: tools.map((agentTool) => `mcp__${TOOL_SERVER}__${agentTool.name}`) };
  }

  run(call: AgentToolCall): Promise<AgentToolResult> {
    return runTool(this.custom, call);
  }

  *events(message: SDKMessage): Generator<Extract<AgentEvent, { type: 'tool' }>> {
    // A call interrupted before its result never gets one, so the turn's end forgets it.
    if (message.type === 'result') this.tools.clear();
    if ((message.type !== 'assistant' && message.type !== 'user') || message.parent_tool_use_id !== null) return;
    const { content } = message.message;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (block.type === 'tool_use' && !this.tools.has(block.id)) {
        const input = block.input as Record<string, unknown>;
        const name = block.name.startsWith('mcp__') ? block.name.split('__').at(-1)! : block.name;
        const own = block.name.startsWith(`mcp__${TOOL_SERVER}__`) ? titleOf(this.custom, name, input) : undefined;
        const tool = { name, title: own ?? toolTitle(block.name, input, this.cwd) };
        this.tools.set(block.id, tool);
        yield { type: 'tool', id: block.id, ...tool, status: 'running' };
      } else if (block.type === 'tool_result') {
        const tool = this.tools.get(block.tool_use_id);
        if (!tool) continue;
        this.tools.delete(block.tool_use_id);
        yield { type: 'tool', id: block.tool_use_id, ...tool, status: block.is_error ? 'failed' : 'done' };
      }
    }
  }
}

function toolTitle(name: string, input: Record<string, unknown>, cwd: string): string {
  const field = (key: string): string => (typeof input[key] === 'string' ? input[key] as string : '');
  const file = (key: string): string => displayPath(field(key), cwd);
  switch (name) {
    case 'Read': return `Read ${file('file_path')}`;
    case 'Write': return `Wrote ${file('file_path')}`;
    case 'Edit':
    case 'MultiEdit': return `Edited ${file('file_path')}`;
    case 'NotebookEdit': return `Edited ${file('notebook_path')}`;
    case 'Bash': return `Ran ${displayCommand(field('command').split('\n')[0]!, cwd)}`;
    case 'Glob': return `Found files matching ${field('pattern')}`;
    case 'Grep': return `Searched for ${field('pattern')}`;
    case 'WebSearch': return `Searched the web for ${field('query')}`;
    case 'WebFetch': return `Fetched ${field('url')}`;
    case 'Task':
    case 'Agent': return `Ran a subagent: ${field('description')}`;
    case 'TodoWrite': return 'Updated the plan';
    case 'Skill': return `Used the ${field('skill')} skill`;
    default: return `Used ${name.startsWith('mcp__') ? name.split('__').at(-1) : name}`;
  }
}
