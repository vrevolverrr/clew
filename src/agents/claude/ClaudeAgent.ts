import type { Options, Query, SDKMessage, SDKResultMessage, SDKUserMessage, SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';
import type * as ClaudeSDK from '@anthropic-ai/claude-agent-sdk/core';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import * as os from 'os';

import { AsyncQueue } from '@/agents/shared/AsyncQueue';
import { resolveCLI } from '@/agents/process/cliBinaryLocator';
import { cliEnv, getEnhancedPath } from '@/agents/process/env';
import { runProcessProbe } from '@/agents/process/processProbe';
import { type AgentAdapter, type AgentEvent, type AgentSession, type AgentSessionOptions, type AuthState, ConversationNotFoundError, type Effort, type ModelOption, type SkillOption, type TurnImage } from '@/agents/types';

import { findClaudeBinaryPath } from './ClaudeBinaryLocator';
import { ClaudeModelAdapter } from './ClaudeModelAdapter';
import { ClaudePermissionAdapter } from './ClaudePermissionAdapter';
import { ClaudeToolAdapter, type ClaudeToolFactory, type ClaudeTools } from './ClaudeToolAdapter';
import { claudeConfigDir, claudeSessionExists, claudeSessionTitle } from './claudeSessionTitle';
import { spawnClaudeCode } from './spawnClaudeCode';

export type ClaudeQuery = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => Query;

const STDERR_LIMIT = 8_192;

let sdkModule: Promise<typeof ClaudeSDK> | undefined;

/** The SDK is loaded on first use, so opening Obsidian does not pay for it. */
function loadClaudeAgentSDK(): Promise<typeof ClaudeSDK> {
  sdkModule ??= import('@anthropic-ai/claude-agent-sdk/core');
  return sdkModule;
}

export class ClaudeAgent implements AgentAdapter {
  readonly id = 'claude';
  readonly skillSyntax = { prefix: '/', atStart: true };
  readonly toolsOnResume = true;
  /** Claude Code loads an `@"path"` itself, as a `Read` the session records. It cannot read a quoted path that holds a quote, escaped or not. */
  readonly fileMention = (path: string): string | undefined => (path.includes('"') ? undefined : `@"${path}"`);

  /** `query` and `toolServer` are the SDK boundary; omit them to load the real SDK lazily. */
  constructor(
    private readonly query?: ClaudeQuery,
    private readonly toolServer: ClaudeToolFactory = async (tools, adapter) => ClaudeToolAdapter.createServer(tools, await loadClaudeAgentSDK(), adapter),
    private readonly userEnv: () => Record<string, string> = () => ({}),
  ) {}

  async authState(cliPath?: string): Promise<AuthState> {
    const cli = await resolveCLI(cliPath, findClaudeBinaryPath);
    if (!cli) return 'missing';
    const output = await runProcessProbe({ command: cli, args: ['auth', 'status'], cwd: os.homedir(), env: cliEnv(getEnhancedPath(cli), this.userEnv()) });
    // `claude auth status` exits non-zero when logged out.
    return output === null ? 'logged-out' : 'logged-in';
  }

  async models(cliPath?: string): Promise<ModelOption[]> {
    const cli = await resolveCLI(cliPath, findClaudeBinaryPath);
    if (!cli) return [];
    const query = this.query ?? (await loadClaudeAgentSDK()).query;
    const prompts = new AsyncQueue<SDKUserMessage>();
    const options = buildOptions({ systemPrompt: '', cwd: os.homedir(), cliPath }, cli, randomUUID(), this.userEnv());
    // No setting sources, so listing models starts no MCP servers or hooks; no saved session, so it adds no chat to the CLI's history.
    const listing = query({ prompt: prompts, options: { ...options, settingSources: [], persistSession: false } });
    try {
      return await new ClaudeModelAdapter(listing).listModels();
    } finally {
      prompts.close();
      listing.close();
    }
  }

  async openSession(options: AgentSessionOptions): Promise<AgentSession> {
    const cli = await resolveCLI(options.cliPath, findClaudeBinaryPath);
    if (!cli) throw new Error('Claude Code 2.1.113 or later not found. Install or update Claude Code, or set its path.');
    const query = this.query ?? (await loadClaudeAgentSDK()).query;
    const id = options.resume ?? randomUUID();
    const tools = new ClaudeToolAdapter(options.cwd, options.tools ?? []);
    const registration = options.tools?.length ? await this.toolServer(options.tools, tools) : undefined;
    const userEnv = this.userEnv();
    const configDir = claudeConfigDir(userEnv);
    const session = new ClaudeSession(query, buildOptions(options, cli, id, userEnv, registration), id, tools, configDir);
    if (options.resume) {
      // The CLI reads the saved conversation at startup, so a session it no longer has fails here and not on the first turn.
      const resume = options.resume;
      await session.started().catch(async (error: unknown) => {
        await session.close();
        throw await claudeSessionExists(resume, configDir) ? error : new ConversationNotFoundError(resume, error);
      });
    }
    return session;
  }
}

function buildOptions(options: AgentSessionOptions, cli: string, id: string, userEnv: Record<string, string>, tools?: ClaudeTools): Options {
  const enhancedPath = getEnhancedPath(cli);
  return {
    cwd: options.cwd,
    systemPrompt: { type: 'preset', preset: 'claude_code', append: options.systemPrompt },
    ...ClaudeModelAdapter.initial(options.model, options.effort),
    pathToClaudeCodeExecutable: cli,
    env: cliEnv(enhancedPath, userEnv),
    spawnClaudeCodeProcess: (spawn) => spawnClaudeCode(spawn),
    // Native settings and rules remain in force; only an explicit chat choice overrides the starting mode.
    tools: { type: 'preset', preset: 'claude_code' },
    ...ClaudePermissionAdapter.settings(options.permissionPolicy),
    ...tools,
    includePartialMessages: true,
    // The CLI saves the conversation; a resumed one keeps its id, and a new one is named up front so the chat can store it.
    ...(options.resume ? { resume: id } : { sessionId: id }),
  };
}

class ClaudeSession implements AgentSession {
  private readonly prompts = new AsyncQueue<SDKUserMessage>();
  private readonly query: Query;
  private readonly modelAdapter: ClaudeModelAdapter;
  private readonly messages: AsyncIterator<SDKMessage>;
  private turnActive = false;
  /** The running turn: its cancellation, and where its approval events go. */
  private turn: { controller: AbortController; approvals: AsyncQueue<AgentEvent> } | null = null;
  /** A message read that a turn left pending when it yielded an approval; the next reader takes it over. */
  private pendingMessage: Promise<IteratorResult<SDKMessage>> | null = null;
  /** Turns the caller stopped reading; their remaining messages are skipped before the next turn. */
  private abandonedTurns = 0;
  /** The end of the CLI's stderr, to say why it failed. */
  private stderr = '';

  constructor(createQuery: ClaudeQuery, options: Options, readonly id: string, private readonly tools: ClaudeToolAdapter, private readonly configDir: string) {
    const canUseTool = new ClaudePermissionAdapter().callback(() => {
      const turn = this.turn;
      return turn ? { signal: turn.controller.signal, push: (event) => turn.approvals.push(event) } : undefined;
    });
    const spawnClaudeCodeProcess = (spawn: SpawnOptions): SpawnedProcess => spawnClaudeCode(spawn, (text) => {
      this.stderr = (this.stderr + text).slice(-STDERR_LIMIT);
    });
    // Bypass never asks, and the SDK warns when it is given a callback it will not call.
    const approvals = options.permissionMode === 'bypassPermissions' ? {} : { canUseTool };
    this.query = createQuery({ prompt: this.prompts, options: { ...options, ...approvals, spawnClaudeCodeProcess } });
    this.messages = this.query[Symbol.asyncIterator]();
    this.modelAdapter = new ClaudeModelAdapter(this.query);
  }

  async *send(text: string, signal?: AbortSignal, images: TurnImage[] = []): AsyncGenerator<AgentEvent, void> {
    if (this.turnActive) throw new Error('A turn is already running');
    if (signal?.aborted) { yield { type: 'done', status: 'interrupted' }; return; }
    this.turnActive = true;
    const controller = new AbortController();
    let interrupted = false;
    let finished = false;
    const interrupt = (): void => {
      interrupted = true;
      controller.abort();
      void this.query.interrupt().catch(() => undefined);
    };
    signal?.addEventListener('abort', interrupt, { once: true });
    try {
      await this.skipAbandonedTurns();
      const prompt = await userMessage(text, images);
      if (controller.signal.aborted) { finished = true; yield { type: 'done', status: 'interrupted' }; return; }
      const approvals = new AsyncQueue<AgentEvent>();
      const approvalEvents = approvals[Symbol.asyncIterator]();
      let approval = approvalEvents.next();
      this.turn = { controller, approvals };
      this.prompts.push(prompt);
      for (;;) {
        // The CLI sends nothing while it waits on an approval, so the turn listens for both.
        const ready = await Promise.race([this.nextMessage().then((message) => ({ message })), approval.then(({ value }) => ({ approval: value as AgentEvent }))]);
        if ('approval' in ready) {
          approval = approvalEvents.next();
          yield ready.approval;
          continue;
        }
        this.pendingMessage = null;
        const next = ready.message;
        if (next.done) {
          finished = true;
          yield this.failed('Claude Code exited before finishing the turn');
          return;
        }
        const delta = textDelta(next.value);
        if (delta) yield { type: 'text', delta };
        if (startsSilentBlock(next.value)) yield { type: 'thinking' };
        yield* this.tools.events(next.value);
        if (next.value.type === 'result') {
          finished = true;
          if (next.value.subtype === 'success' && !next.value.is_error) {
            const usage = await this.contextUsage();
            if (usage) yield usage;
          }
          yield finish(next.value, interrupted);
          return;
        }
      }
    } catch (error) {
      finished = true;
      yield this.failed(error instanceof Error ? error.message : String(error));
    } finally {
      signal?.removeEventListener('abort', interrupt);
      if (!finished) {
        this.abandonedTurns++;
        if (!interrupted) interrupt();
      }
      controller.abort();
      this.turn = null;
      this.turnActive = false;
    }
  }

  private async contextUsage(): Promise<AgentEvent | null> {
    try {
      const { totalTokens, rawMaxTokens } = await this.query.getContextUsage({ detail: 'summary' });
      return rawMaxTokens > 0 ? { type: 'usage', used: totalTokens, window: rawMaxTokens } : null;
    } catch {
      // The meter is optional; a failed query must not fail the turn.
      return null;
    }
  }

  async started(): Promise<void> {
    await this.query.initializationResult();
  }

  title(): Promise<string | undefined> {
    return claudeSessionTitle(this.id, this.configDir);
  }

  async skills(): Promise<SkillOption[]> {
    const commands = await this.query.supportedCommands();
    // Claude Code's own commands and bundled skills are left out; the list is the student's own.
    return commands
      .filter((command) => !command.builtin)
      .map(({ name, description, argumentHint }) => ({ name, description, argumentHint: argumentHint || undefined }));
  }

  async setModel(model?: string, effort?: Effort): Promise<void> {
    await this.modelAdapter.setModel(model, effort);
  }

  async close(): Promise<void> {
    this.turn?.controller.abort();
    this.prompts.close();
    this.query.close();
  }

  private failed(error: string): AgentEvent {
    const detail = this.stderr.trim();
    return { type: 'done', status: 'failed', error, ...(detail ? { detail } : {}) };
  }

  private async skipAbandonedTurns(): Promise<void> {
    while (this.abandonedTurns > 0) {
      const next = await this.nextMessage();
      this.pendingMessage = null;
      if (next.done || next.value.type === 'result') this.abandonedTurns--;
    }
  }

  private nextMessage(): Promise<IteratorResult<SDKMessage>> {
    this.pendingMessage ??= this.messages.next();
    return this.pendingMessage;
  }
}

async function userMessage(text: string, images: TurnImage[]): Promise<SDKUserMessage> {
  // Images go first, as the API recommends.
  const blocks = await Promise.all(images.map(async ({ path, mediaType }) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: mediaType, data: (await readFile(path)).toString('base64') },
  })));
  return {
    type: 'user',
    message: { role: 'user', content: blocks.length ? [...blocks, { type: 'text', text }] : text },
    parent_tool_use_id: null,
    session_id: '',
    uuid: randomUUID(),
  };
}

function textDelta(message: SDKMessage): string | null {
  if (message.type !== 'stream_event' || message.parent_tool_use_id !== null) return null;
  const { event } = message;
  return event.type === 'content_block_delta' && event.delta.type === 'text_delta' ? event.delta.text : null;
}

/** A thinking or tool-use block starts streaming; the finished tool call arrives only once its input has streamed. */
function startsSilentBlock(message: SDKMessage): boolean {
  if (message.type !== 'stream_event' || message.parent_tool_use_id !== null) return false;
  return message.event.type === 'content_block_start' && message.event.content_block.type !== 'text';
}

function finish(result: SDKResultMessage, interrupted: boolean): AgentEvent {
  if (interrupted) return { type: 'done', status: 'interrupted' };
  if (result.subtype === 'success' && !result.is_error) return { type: 'done', status: 'completed' };
  const error = result.subtype === 'success' ? result.result : result.errors.join('\n') || result.subtype;
  return { type: 'done', status: 'failed', error };
}
