import * as path from 'path';

import type { AgentEvent, AgentTool, Effort, ModelOption, ToolApprovalRequest } from '@/agents/types';

// What each provider implements for models, tools and permissions, and the helpers they share to build it.

export interface AgentModelSelection {
  model?: string;
  effort?: Effort;
}

/** Normalized model discovery and selection on an existing provider connection. */
export interface AgentModelAdapter {
  listModels(): Promise<ModelOption[]>;
  setModel(model?: string, effort?: Effort): Promise<AgentModelSelection>;
}

interface VersionedModel {
  id: string;
  name: string;
  /** Dotted version such as "5.5"; empty when the CLI gives none. */
  version: string;
  efforts: string[];
}

/** Keeps the newest version of each family, in the order the families first appear. A tie keeps the first. */
export function latestPerFamily(models: VersionedModel[], defaultId: string | undefined): ModelOption[] {
  const defaultName = models.find((model) => model.id === defaultId)?.name;
  const latest = new Map<string, VersionedModel>();
  for (const model of models) {
    const kept = latest.get(model.name);
    if (!kept || compareVersions(model.version, kept.version) > 0) latest.set(model.name, model);
  }
  return [...latest.values()].map(({ id, name, efforts }) => ({ id, name, efforts, isDefault: name === defaultName }));
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

export interface AgentToolCall {
  name: string;
  input: unknown;
}

export interface AgentToolResult {
  text: string;
  success: boolean;
}

/** Only the inbound event is native; activity and execution results share one shape. */
export interface AgentToolAdapter<NativeEvent> {
  events(event: NativeEvent): Iterable<Extract<AgentEvent, { type: 'tool' }>>;
  run(call: AgentToolCall): Promise<AgentToolResult>;
}

/** The value the agent gave a tool's argument, or an empty string when it gave none. */
function argumentOf(tool: AgentTool, input: unknown): string {
  const value = (input as Record<string, unknown> | null | undefined)?.[tool.argument.name];
  return typeof value === 'string' ? value : '';
}

/** The chat's one-line title for a call to one of `tools`, or undefined when `name` is not one of them. */
export function titleOf(tools: readonly AgentTool[], name: string, input: unknown): string | undefined {
  const tool = tools.find((candidate) => candidate.name === name);
  return tool?.title(argumentOf(tool, input));
}

export async function runTool(tools: readonly AgentTool[], call: AgentToolCall): Promise<AgentToolResult> {
  const tool = tools.find((candidate) => candidate.name === call.name);
  if (!tool) return { text: 'No tool named ' + call.name + '.', success: false };
  return { text: tool.run(argumentOf(tool, call.input)), success: true };
}

/** A tool's file path as the student knows it: relative to the vault, else just the file name. */
export function displayPath(filePath: string, cwd: string): string {
  const relative = path.relative(cwd, filePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : path.basename(filePath);
}

/** A shell command with the vault's own path dropped, since commands already run in the vault. */
export function displayCommand(command: string, cwd: string): string {
  return cwd ? command.split(`${cwd}/`).join('') : command;
}

/** Puts an approval event on the turn's stream and waits for the answer, or for `signal` to end the request. */
export interface AgentApprovalContext {
  signal: AbortSignal;
  push(event: AgentEvent): void;
}

/** Native requests enter; normalized approval events and once-only decisions leave. */
export interface AgentPermissionAdapter<NativeRequest> {
  request(request: NativeRequest, turn: AgentApprovalContext): Promise<boolean>;
}

export function askApproval(push: (event: AgentEvent) => void, request: ToolApprovalRequest, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const settle = (approved: boolean): void => {
      signal.removeEventListener('abort', cancel);
      resolve(approved && !signal.aborted);
    };
    const cancel = (): void => settle(false);
    signal.addEventListener('abort', cancel, { once: true });
    push({ type: 'approval', request, signal, answer: settle });
  });
}
