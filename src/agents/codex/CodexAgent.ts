import * as os from 'os';

import { ManagedStdioProcess } from '@/agents/process/ManagedStdioProcess';
import { AsyncQueue } from '@/agents/shared/AsyncQueue';
import { JSONRPCErrorResponse, JSONRPCTransport } from '@/agents/shared/JSONRPCTransport';
import { resolveCLI } from '@/agents/process/cliBinaryLocator';
import { cliEnv, getEnhancedPath } from '@/agents/process/env';
import { runProcessProbe } from '@/agents/process/processProbe';
import { type AgentAdapter, type AgentEvent, type AgentSession, type AgentSessionOptions, type AuthState, ConversationNotFoundError, type Effort, type ModelOption, type SkillOption, type TurnImage } from '@/agents/types';
import type { AgentApprovalContext } from '@/agents/adapters';

import { findCodexBinaryPath } from './CodexBinaryLocator';
import { CodexModelAdapter } from './CodexModelAdapter';
import { CodexToolAdapter } from './CodexToolAdapter';
import type {
  AgentMessageDeltaParams,
  DynamicToolCallParams,
  ErrorParams,
  ItemParams,
  ModelListResult,
  SkillsListResult,
  ThreadItem,
  ThreadStartResult,
  TokenUsageParams,
  TurnScopedParams,
  TurnStartResult,
} from './codexProtocol';
import { CODEX_APPROVAL_METHODS, CODEX_QUESTION_METHOD, CodexPermissionAdapter, type CodexApprovalRequest, type CodexPermissionSetup, type CodexQuestionRequest } from './CodexPermissionAdapter';

const APP_SERVER_ARGS = ['app-server', '--listen', 'stdio://'];
const CLIENT_INFO = { name: 'clew', version: '0.0.1' };
const REQUEST_TIMEOUT_MS = 30_000;
/** How long a closed stdout waits for the process to close, so its last stderr reaches the error. */
const PROCESS_CLOSE_GRACE_MS = 3_000;
const STDERR_LIMIT = 8_192;
/** Only recent turns still send late notifications; older ids are dropped so a long chat does not grow the set. */
const RETIRED_TURN_LIMIT = 16;

export class CodexAgent implements AgentAdapter {
  readonly id = 'codex';
  readonly skillSyntax = { prefix: '$', atStart: false };
  readonly toolsOnResume = false;

  constructor(private readonly userEnv: () => Record<string, string> = () => ({})) {}

  async authState(cliPath?: string): Promise<AuthState> {
    const cli = await resolveCLI(cliPath, findCodexBinaryPath);
    if (!cli) return 'missing';
    // `codex login status` reports on stderr and exits non-zero when logged out.
    const output = await runProcessProbe({ command: cli, args: ['login', 'status'], cwd: os.homedir(), env: buildEnv(cli, this.userEnv()) });
    return output === null ? 'logged-out' : 'logged-in';
  }

  async models(cliPath?: string): Promise<ModelOption[]> {
    const cli = await resolveCLI(cliPath, findCodexBinaryPath);
    if (!cli) return [];
    const { proc, transport } = await startAppServer(cli, os.homedir(), this.userEnv());
    try {
      return await new CodexModelAdapter(
        (cursor) => transport.request<ModelListResult>('model/list', { cursor }),
        // Discovery runs in the home folder, so a vault's .codex/config.toml only changes the label, not the sessions.
        () => transport.request<ThreadStartResult>('thread/start', { cwd: os.homedir(), ephemeral: true }),
      ).listModels();
    } finally {
      transport.dispose();
      await proc.shutdown();
    }
  }

  async openSession(options: AgentSessionOptions): Promise<AgentSession> {
    const cli = await resolveCLI(options.cliPath, findCodexBinaryPath);
    if (!cli) throw new Error('Codex CLI not found. Install Codex or set its path.');
    return CodexSession.open(options, cli, this.userEnv());
  }
}

async function startAppServer(cli: string, cwd: string, userEnv: Record<string, string>): Promise<{ proc: ManagedStdioProcess; transport: JSONRPCTransport }> {
  const proc = new ManagedStdioProcess({ command: cli, args: APP_SERVER_ARGS, cwd, env: buildEnv(cli, userEnv), stderrBufferLimit: STDERR_LIMIT, stdio: ['pipe', 'pipe', 'pipe'] });
  proc.start();
  const transport = new JSONRPCTransport({
    input: proc.stdout,
    output: proc.stdin,
    onClose: (listener) => proc.onClose(() => listener(new Error('Codex exited'))),
  }, REQUEST_TIMEOUT_MS, { streamCloseGraceMs: PROCESS_CLOSE_GRACE_MS });
  try {
    await transport.request('initialize', { clientInfo: CLIENT_INFO, capabilities: { experimentalApi: true } });
    transport.notify('initialized');
    return { proc, transport };
  } catch (error) {
    transport.dispose();
    await proc.shutdown();
    throw openError(error, proc);
  }
}

/** A failed open is shown to the student as a notice, so it carries what Codex wrote to stderr, such as a broken config.toml. */
function openError(error: unknown, proc: ManagedStdioProcess): unknown {
  const stderr = proc.getStderrSnapshot();
  return error instanceof Error && !(error instanceof ConversationNotFoundError) && stderr ? new Error(`${error.message}\n\n${stderr}`, { cause: error }) : error;
}

function failed(error: string, proc: ManagedStdioProcess): AgentEvent {
  const detail = proc.getStderrSnapshot();
  return { type: 'done', status: 'failed', error, ...(detail ? { detail } : {}) };
}

function buildEnv(cli: string, userEnv: Record<string, string>): Record<string, string> {
  return cliEnv(getEnhancedPath(cli), userEnv);
}

interface ActiveTurn {
  id: string | null;
  cancellation: AbortController;
  events: AsyncQueue<AgentEvent>;
  /** Text streamed so far per agent message, so a completed message only adds what never streamed. */
  streamed: Map<string, string>;
  /** The agent message that streamed last; a new one starts a new paragraph. */
  lastMessageId: string | null;
  error: string | null;
  interruptRequested: boolean;
  finished: boolean;
}

class CodexSession implements AgentSession {
  private turn: ActiveTurn | null = null;
  private readonly permissions: CodexPermissionAdapter;
  private readonly modelAdapter: CodexModelAdapter;
  private readonly items = new Map<string, ThreadItem>();
  /** Finished or abandoned turns; their late notifications and approvals must not bind a new turn. */
  private readonly retiredTurnIds = new Set<string>();

  /** Sent on every turn; `turn/start` keeps an override for later turns, so returning to the default sends it explicitly. */
  private model: string | undefined;
  private effort: Effort | undefined;

  static async open(options: AgentSessionOptions, cli: string, userEnv: Record<string, string>): Promise<CodexSession> {
    const tools = new CodexToolAdapter(options.cwd, options.tools ?? []);
    const { proc, transport } = await startAppServer(cli, options.cwd, userEnv);
    try {
      let probed: Promise<ThreadStartResult> | undefined;
      const probe = (): Promise<ThreadStartResult> => probed ??= transport.request<ThreadStartResult>('thread/start', { cwd: options.cwd, ephemeral: true })
        .catch((error: unknown) => { probed = undefined; throw error; });
      const permissions = await CodexPermissionAdapter.prepare(options.permissionPolicy, options.resume, probe);
      const settings = {
        model: options.model,
        ...permissions.thread,
        developerInstructions: options.systemPrompt,
        cwd: options.cwd,
      };
      // The thread is saved so a later session can resume it. Its tools are saved with it, since a resume takes none.
      const opened = options.resume
        ? await resumeThread(transport, options.resume, settings)
        : await transport.request<ThreadStartResult>('thread/start', { ...settings, ...tools.registration() });
      CodexPermissionAdapter.confirm(options.permissionPolicy, opened);
      return new CodexSession(proc, transport, opened.thread.id, options, probe, tools, permissions);
    } catch (error) {
      transport.dispose();
      await proc.shutdown();
      throw openError(error, proc);
    }
  }

  private constructor(
    private readonly proc: ManagedStdioProcess,
    private readonly transport: JSONRPCTransport,
    readonly id: string,
    private readonly options: AgentSessionOptions,
    probe: () => Promise<ThreadStartResult>,
    private readonly tools: CodexToolAdapter,
    permissionSetup: CodexPermissionSetup,
  ) {
    this.model = options.model;
    this.effort = options.effort;
    this.modelAdapter = new CodexModelAdapter((cursor) => transport.request<ModelListResult>('model/list', { cursor }), probe);
    this.permissions = new CodexPermissionAdapter(permissionSetup, (id) => this.items.get(id));
    for (const method of CODEX_APPROVAL_METHODS) {
      // A server request always carries an id; only a notification has none.
      transport.onRequest(method, (params, { requestId }) => {
        const id = requestId!;
        const request = params as CodexApprovalRequest;
        return this.permissions.reply(id, method, request, this.approvalContext(request));
      });
    }
    transport.onRequest(CODEX_QUESTION_METHOD, (params, { requestId }) => {
      const request = params as CodexQuestionRequest;
      return this.permissions.answer(requestId!, request, this.approvalContext(request));
    });
    transport.onNotification('serverRequest/resolved', (params) => {
      const { threadId, requestId } = params as { threadId: string; requestId: string | number };
      this.permissions.resolved(threadId, requestId);
    });
    transport.onRequest('item/tool/call', (params) => this.tools.reply(params as DynamicToolCallParams));
    transport.onNotification('item/agentMessage/delta', (params) => this.onDelta(params as AgentMessageDeltaParams));
    transport.onNotification('item/started', (params) => this.onItemStarted(params as ItemParams));
    transport.onNotification('item/completed', (params) => this.onItemCompleted(params as ItemParams));
    transport.onNotification('thread/tokenUsage/updated', (params) => this.onTokenUsage(params as TokenUsageParams));
    transport.onNotification('error', (params) => this.onError(params as ErrorParams));
    transport.onNotification('turn/completed', (params) => this.onTurnCompleted(params as TurnScopedParams));
    proc.onClose(() => {
      if (this.turn) finishTurn(this.turn, failed('Codex exited before finishing the turn', proc));
    });
  }

  async *send(text: string, signal?: AbortSignal, images: TurnImage[] = []): AsyncGenerator<AgentEvent, void> {
    if (this.turn) throw new Error('A turn is already running');
    if (signal?.aborted) { yield { type: 'done', status: 'interrupted' }; return; }
    const turn: ActiveTurn = {
      id: null,
      cancellation: new AbortController(),
      events: new AsyncQueue(),
      streamed: new Map(),
      lastMessageId: null,
      error: null,
      interruptRequested: false,
      finished: false,
    };
    this.turn = turn;
    const interrupt = (): void => this.interrupt(turn);
    signal?.addEventListener('abort', interrupt, { once: true });
    let delivered = false;
    try {
      const { turn: started } = await this.transport.request<TurnStartResult>('turn/start', {
        threadId: this.id,
        input: [...images.map(({ path }) => ({ type: 'localImage', path })), { type: 'text', text, text_elements: [] }],
        model: this.model,
        effort: this.effort,
        summary: 'none',
        ...this.permissions.turnSettings(),
      });
      turn.id ??= started.id;
      if (turn.interruptRequested) this.interrupt(turn);
      for await (const event of turn.events) {
        if (event.type === 'done') delivered = true;
        yield event;
      }
    } catch (error) {
      delivered = true;
      yield failed(error instanceof Error ? error.message : String(error), this.proc);
    } finally {
      signal?.removeEventListener('abort', interrupt);
      if (!delivered) {
        this.interrupt(turn);
      }
      if (turn.id) this.retire(turn.id);
      turn.cancellation.abort();
      this.items.clear();
      if (this.turn === turn) this.turn = null;
    }
  }

  async skills(): Promise<SkillOption[]> {
    const { data } = await this.transport.request<SkillsListResult>('skills/list', { cwds: [this.options.cwd] });
    return (data[0]?.skills ?? [])
      .filter((skill) => skill.enabled && skill.scope !== 'system')
      .map((skill) => ({ name: skill.name, description: skill.interface?.shortDescription ?? skill.shortDescription ?? skill.description }));
  }

  async setModel(model?: string, effort?: Effort): Promise<void> {
    const selected = await this.modelAdapter.setModel(model, effort);
    this.model = selected.model;
    this.effort = selected.effort;
  }

  async close(): Promise<void> {
    this.turn?.cancellation.abort();
    this.transport.dispose();
    await this.proc.shutdown();
  }

  private retire(turnId: string): void {
    this.retiredTurnIds.add(turnId);
    if (this.retiredTurnIds.size > RETIRED_TURN_LIMIT) this.retiredTurnIds.delete(this.retiredTurnIds.values().next().value!);
  }

  private interrupt(turn: ActiveTurn): void {
    turn.interruptRequested = true;
    turn.cancellation.abort();
    if (!turn.id || turn.finished) return;
    this.transport.request('turn/interrupt', { threadId: this.id, turnId: turn.id }).catch(() => undefined);
  }

  /** The running turn that owns a server request, or undefined so the request is declined. */
  private approvalContext(request: TurnScopedParams): AgentApprovalContext | undefined {
    const turn = typeof request.threadId === 'string' && typeof request.turnId === 'string' ? this.turnFor(request) : undefined;
    return turn && !turn.finished ? { signal: turn.cancellation.signal, push: (event: AgentEvent) => turn.events.push(event) } : undefined;
  }

  private turnFor(params: TurnScopedParams): ActiveTurn | null {
    const turn = this.turn;
    if (!turn || params.threadId !== this.id) return null;
    const turnId = params.turnId ?? params.turn?.id;
    if (!turnId) return turn;
    if (this.retiredTurnIds.has(turnId)) return null;
    turn.id ??= turnId;
    return turn.id === turnId ? turn : null;
  }

  private onDelta(params: AgentMessageDeltaParams): void {
    const turn = this.turnFor(params);
    if (!turn || turn.finished) return;
    this.pushText(turn, params.itemId, params.delta);
  }

  private onItemStarted(params: ItemParams): void {
    const turn = this.turnFor(params);
    if (!turn || turn.finished) return;
    // Kept only to show an approval the item it gates.
    if (params.item.type === 'commandExecution' || params.item.type === 'fileChange') this.items.set(params.item.id, params.item);
    if (params.item.type === 'reasoning') {
      turn.events.push({ type: 'thinking' });
      return;
    }
    for (const event of this.tools.events({ item: params.item, phase: 'started' })) turn.events.push(event);
  }

  private onItemCompleted(params: ItemParams): void {
    const turn = this.turnFor(params);
    const { item } = params;
    if (!turn || turn.finished) return;
    if (item.type !== 'agentMessage') {
      for (const event of this.tools.events({ item, phase: 'completed' })) turn.events.push(event);
      return;
    }
    if (!item.text) return;
    const streamed = turn.streamed.get(item.id) ?? '';
    const missing = item.text.startsWith(streamed) ? item.text.slice(streamed.length) : '';
    if (missing) this.pushText(turn, item.id, missing);
  }

  private pushText(turn: ActiveTurn, itemId: string, delta: string): void {
    const separator = turn.lastMessageId !== null && turn.lastMessageId !== itemId ? '\n\n' : '';
    turn.lastMessageId = itemId;
    turn.streamed.set(itemId, (turn.streamed.get(itemId) ?? '') + delta);
    turn.events.push({ type: 'text', delta: separator + delta });
  }

  private onTokenUsage(params: TokenUsageParams): void {
    // A resumed thread replays its last usage when a turn starts, under the earlier turn's id, so this must not bind the active turn to it.
    const turn = this.turn;
    const { last, modelContextWindow } = params.tokenUsage;
    if (turn && !turn.finished && params.threadId === this.id && modelContextWindow) turn.events.push({ type: 'usage', used: last.totalTokens, window: modelContextWindow });
  }

  private onError(params: ErrorParams): void {
    const turn = this.turnFor(params);
    if (turn && !params.willRetry) turn.error = params.error.message;
  }

  private onTurnCompleted(params: TurnScopedParams): void {
    const turn = this.turnFor(params);
    if (!turn || !params.turn) return;
    switch (params.turn.status) {
      case 'completed':
        finishTurn(turn, { type: 'done', status: 'completed' });
        break;
      case 'interrupted':
        finishTurn(turn, { type: 'done', status: 'interrupted' });
        break;
      case 'failed':
        finishTurn(turn, { type: 'done', status: 'failed', error: params.turn.error?.message ?? turn.error ?? 'Codex turn failed' });
        break;
    }
  }
}

/** A failed resume is a lost thread only if Codex cannot read the thread either; its error text is not relied on. */
async function resumeThread(transport: JSONRPCTransport, threadId: string, settings: Record<string, unknown>): Promise<ThreadStartResult> {
  try {
    return await transport.request<ThreadStartResult>('thread/resume', { ...settings, threadId, excludeTurns: true });
  } catch (error) {
    if (!(error instanceof JSONRPCErrorResponse)) throw error;
    const readable = await transport.request('thread/read', { threadId }).then(() => true, (readError: unknown) => !(readError instanceof JSONRPCErrorResponse));
    throw readable ? error : new ConversationNotFoundError(threadId, error);
  }
}

function finishTurn(turn: ActiveTurn, event: AgentEvent): void {
  if (turn.finished) return;
  turn.finished = true;
  turn.cancellation.abort();
  turn.events.push(event);
  turn.events.close();
}
