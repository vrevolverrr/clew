// The subset of the `codex app-server` JSON-RPC protocol that tutor sessions use.

export interface ThreadStartResult {
  thread: { id: string };
  /** The model the thread runs, the CLI's default when none was asked for. */
  model: string;
  /** The effort the thread runs at, from config.toml when none was asked for; null when the config sets none. */
  reasoningEffort?: string | null;
  approvalsReviewer?: string;
  approvalPolicy?: string | Record<string, unknown>;
  sandbox?: { type: string; [key: string]: unknown };
}

export interface CodexModel {
  id: string;
  displayName: string;
  supportedReasoningEfforts: { reasoningEffort: string }[];
  defaultReasoningEffort: string;
  isDefault: boolean;
}

export interface ModelListResult {
  data: CodexModel[];
  nextCursor: string | null;
}

interface CodexSkill {
  name: string;
  description: string;
  shortDescription?: string;
  interface?: { shortDescription?: string };
  scope: 'user' | 'repo' | 'system' | 'admin';
  enabled: boolean;
}

export interface SkillsListResult {
  data: { cwd: string; skills: CodexSkill[] }[];
}

export interface TurnStartResult {
  turn: { id: string };
}

interface TurnError {
  message: string;
}

export type TurnStatus = 'inProgress' | 'completed' | 'failed' | 'interrupted';

/** Notification params carry the thread and, for turn-scoped events, the turn they belong to. */
export interface TurnScopedParams {
  threadId?: string;
  turnId?: string;
  turn?: { id: string; status: TurnStatus; error: TurnError | null };
}

export interface TokenUsageParams extends TurnScopedParams {
  tokenUsage: { last: { totalTokens: number }; modelContextWindow: number | null };
}

export interface AgentMessageDeltaParams extends TurnScopedParams {
  itemId: string;
  delta: string;
}

export type CommandAction =
  | { type: 'read'; command: string; name: string; path: string }
  | { type: 'listFiles'; command: string; path: string | null }
  | { type: 'search'; command: string; query: string | null; path: string | null }
  | { type: 'unknown'; command: string };

/** The thread items a turn reports; tool items carry what their one-line title needs. */
export type ThreadItem =
  | { type: 'agentMessage'; id: string; text: string }
  | { type: 'commandExecution'; id: string; command: string; commandActions: CommandAction[]; status: ToolItemStatus }
  | { type: 'fileChange'; id: string; changes: { path: string }[]; status: ToolItemStatus }
  | { type: 'mcpToolCall'; id: string; tool: string; status: ToolItemStatus }
  | { type: 'dynamicToolCall'; id: string; tool: string; arguments: unknown; status: ToolItemStatus }
  | { type: 'webSearch'; id: string; query: string }
  | { type: 'imageView'; id: string; path: string }
  | { type: 'reasoning'; id: string }
  | { type: 'other'; id: string };

/** A call to one of Clew's own tools, which the app server asks the client to run. */
export interface DynamicToolCallParams {
  tool: string;
  arguments: unknown;
}

export interface DynamicToolCallResponse {
  contentItems: { type: 'inputText'; text: string }[];
  success: boolean;
}

type ToolItemStatus = 'inProgress' | 'completed' | 'failed' | 'declined';

export interface ItemParams extends TurnScopedParams {
  item: ThreadItem;
}

export interface ErrorParams extends TurnScopedParams {
  error: TurnError;
  willRetry: boolean;
}
