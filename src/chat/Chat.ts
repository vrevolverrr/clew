import type { AgentAdapter, AgentId, AgentSession, ModelOption, PermissionPolicy, SkillOption, SkillSyntax } from '@/agents/types';
import { AGENT_IDS } from '@/agents/providers';
import type { ChatContext } from '@/context/ChatContext';
import { turnText } from '@/context/turnText';
import type { ChatDefaults, ModelChoice } from '@/chat/ChatDefaults';
import { type ChatRecord, type ChatTurn, type Rating, rateTurn, turnTitle } from '@/chat/ChatRecord';
import { ChatSession } from '@/chat/ChatSession';
import type { ChatStore } from '@/chat/ChatStore';
import { runTurn, type TurnView } from '@/chat/runTurn';
import { messageOf } from '@/shared/messageOf';

/** What the chat tells whoever draws it. */
export interface ChatEvents {
  /** Running, failed, the agent, its model or the permission policy changed. */
  changed(): void;
  /** The chat moved to another agent, whose session starts without the earlier messages. */
  switched(): void;
  /** The CLI no longer has this chat's conversation, so the agent starts without the earlier messages. */
  lost(): void;
  /** Something to show in the transcript. */
  notice(text: string): void;
  /** Something to show for a moment, outside the transcript. */
  warn(text: string): void;
}

interface ChatDeps {
  /** Where a new chat starts: the app's agent and choices, which follow this chat's picks. */
  defaults: ChatDefaults;
  agents: Record<AgentId, AgentAdapter>;
  /** Each CLI's model list, read once per plugin load. */
  models: Record<AgentId, Promise<ModelOption[]>>;
  store: ChatStore;
  /** The vault folder the agent runs in. */
  cwd: string;
}

/** One chat: its record, its agent session and its turns. It is the only writer of the record. */
export class Chat {
  private chat: ChatRecord;
  private choices: Record<AgentId, ModelChoice>;
  private session!: ChatSession;
  /** The agent this chat talks to; the defaults' agent is only where a new chat starts. */
  private current: AgentId;
  private turn: AbortController | null = null;
  private task: Promise<void> | null = null;
  private restartAfterTurn = false;
  private switching = false;
  private closed = false;
  private hasFailed = false;

  constructor(record: ChatRecord, private readonly deps: ChatDeps, private readonly events: ChatEvents) {
    const { defaults } = deps;
    this.chat = record;
    this.current = record.agent;
    this.choices = Object.fromEntries(AGENT_IDS.map((id) => [
      id, id === record.agent ? record.choice ?? defaults.choice(id) : defaults.choice(id),
    ])) as Record<AgentId, ModelChoice>;
  }

  /** The latest record, including turns that ended while no one was looking. */
  get record(): ChatRecord { return this.chat; }
  get agent(): AgentId { return this.current; }
  get running(): boolean { return this.turn !== null; }
  get failed(): boolean { return this.hasFailed; }
  /** A turn is running, the agent is changing, or the chat is closed: a new turn has to wait. */
  get busy(): boolean { return this.turn !== null || this.switching || this.closed; }
  get permissionPolicy(): PermissionPolicy { return this.chat.permissionPolicy ?? 'inherit'; }
  get skillSyntax(): SkillSyntax { return this.deps.agents[this.current].skillSyntax; }

  models(agent: AgentId): Promise<ModelOption[]> { return this.deps.models[agent]; }
  choice(agent: AgentId): ModelChoice { return this.choices[agent]; }
  skills(): Promise<SkillOption[]> { return this.session.skills(); }

  /** Opens the session, resuming the saved conversation, and moves a saved model to its newest version. */
  open(): void {
    void this.replaceSession(this.current, this.chat.sessionId);
    void this.upgradeChoice();
  }

  /** Runs one turn on `context` and saves it. */
  send(context: ChatContext, view: TurnView): Promise<void> {
    const chat = this.chat;
    return this.guarded(async (signal) => {
      const agent = this.deps.agents[this.current];
      const text = await turnText(context, { skillSyntax: agent.skillSyntax, fileMention: agent.fileMention, root: this.deps.cwd });
      const { turn, sessionId, title } = await runTurn(
        () => this.session.open(),
        { context, root: this.deps.cwd, text, signal, sessionId: chat.sessionId, wantTitle: !chat.turns.length },
        view,
      );
      await this.remember(turn, sessionId, title, this.session.promptId);
    });
  }

  /** Runs a turn on a session the caller made, as if the student had sent `context`, and saves it. */
  play(context: ChatContext, session: AgentSession, view: TurnView): Promise<void> {
    const { sessionId } = this.chat;
    return this.guarded(async (signal) => {
      const { turn } = await runTurn(async () => session, { context, root: this.deps.cwd, text: context.message, signal }, view);
      await this.remember(turn, sessionId, undefined, undefined);
    });
  }

  stop(): void { this.turn?.abort(); }

  /** Saves the choice. The same agent takes it from its next turn; another agent gets a new session, without the old conversation. */
  async choose(agent: AgentId, choice: ModelChoice): Promise<void> {
    if (this.closed || this.switching) return;
    if (this.turn && agent !== this.current) {
      this.events.warn('Stop the current reply before switching agents.');
      return;
    }
    this.choices = { ...this.choices, [agent]: choice };
    await this.changing(async () => {
      await this.deps.defaults.setChoice(agent, choice);
      if (this.closed) return;
      if (agent === this.current) return this.apply(choice);
      await this.deps.defaults.setAgent(agent);
      if (this.closed) return;
      this.current = agent;
      this.chat = { ...this.chat, agent, choice, sessionId: undefined };
      this.events.switched();
      this.events.changed();
      const closed = this.replaceSession(agent);
      await this.saveIfKept();
      void this.upgradeChoice();
      await closed;
    });
  }

  /** Starting a new process restores native settings when returning to Inherit, including Codex's sandbox. */
  async choosePermission(permissionPolicy: PermissionPolicy): Promise<void> {
    if (this.closed || this.switching || permissionPolicy === this.permissionPolicy) return;
    this.chat = { ...this.chat, permissionPolicy };
    this.events.changed();
    try {
      const restarted = this.restart();
      await this.saveIfKept();
      await restarted;
    } catch (error) {
      this.events.warn(`Could not change the permission policy: ${messageOf(error)}`);
    }
  }

  async rate(index: number, rating: Rating | undefined): Promise<void> {
    // A turn is added to the chat once it ends, so a thumb pressed in that instant has no turn to land on yet.
    if (!this.chat.turns[index]) return;
    const next = rateTurn(this.chat, index, rating);
    this.chat = next;
    try {
      await this.deps.store.save(next);
    } catch (error) {
      this.events.warn(`Could not save this rating: ${messageOf(error)}`);
    }
  }

  /**
   * Opens a new session, so the agent starts with the settings now in force, and resumes this chat's conversation in it.
   * A turn that is running finishes first.
   */
  async restart(): Promise<void> {
    if (this.closed || !this.session) return;
    if (this.turn) {
      this.restartAfterTurn = true;
      return;
    }
    await this.replaceSession(this.current, this.chat.sessionId);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.turn?.abort();
    await this.task;
    await this.session?.close();
  }

  private async guarded(work: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.busy) return;
    const controller = new AbortController();
    this.turn = controller;
    this.hasFailed = false;
    this.events.changed();
    this.task = work(controller.signal).catch((error: unknown) => {
      this.hasFailed = true;
      this.events.notice(`Could not send this message: ${messageOf(error)}`);
    });
    try {
      await this.task;
    } finally {
      this.turn = null;
      this.events.changed();
      if (this.restartAfterTurn && !this.closed) void this.restart();
    }
  }

  /** Adds the finished turn to the chat and saves it, so a restart can show it and the agent can resume it. */
  private async remember(turn: ChatTurn, sessionId: string | undefined, title: string | undefined, prompt: string | undefined): Promise<void> {
    const next: ChatRecord = {
      ...this.chat,
      choice: this.choices[this.current],
      sessionId,
      title: this.chat.turns.length ? this.chat.title : (title ?? turnTitle(turn)),
      updatedAt: Date.now(),
      turns: [...this.chat.turns, { ...turn, prompt }],
    };
    this.chat = next;
    this.hasFailed = turn.status === 'failed';
    // The CLI may have died with the turn; a new process resumes the conversation, and costs one start if it had not.
    if (this.hasFailed) this.restartAfterTurn = true;
    this.events.changed();
    try {
      await this.deps.store.save(next);
    } catch (error) {
      this.events.warn(`Could not save this chat: ${messageOf(error)}`);
    }
  }

  /** Opens a session for `agent`, resuming `resume`, and closes the old one. The returned promise ends when the old one is closed. */
  private replaceSession(agent: AgentId, resume?: string): Promise<void> {
    const previous = this.session as ChatSession | undefined;
    // A restart waiting for a turn is moot: the new session starts with the settings now in force.
    this.restartAfterTurn = false;
    const session = new ChatSession(this.deps.agents[agent], () => this.choice(agent), {
      cwd: this.deps.cwd,
      resume,
      permissionPolicy: this.permissionPolicy,
      onLost: () => {
        if (!this.closed && this.session === session) this.events.lost();
      },
    });
    this.session = session;
    void session.open().catch((error: unknown) => {
      if (!this.closed && this.session === session) {
        this.hasFailed = true;
        this.events.notice(`Could not open the agent: ${messageOf(error)}`);
        this.events.changed();
      }
    });
    return previous?.close() ?? Promise.resolve();
  }

  /** Moves a saved model to the newest version of its family once the CLI's list arrives. */
  private async upgradeChoice(): Promise<void> {
    const agent = this.current;
    const choice = this.choices[agent];
    const latest = (await this.models(agent)).find((option) => option.name === choice.name);
    // A pick made while the list loaded wins over the upgrade.
    if (!latest || latest.id === choice.model || this.choices[agent] !== choice) return;
    if (this.closed || this.switching || agent !== this.current) return;
    const next = { ...choice, model: latest.id };
    await this.changing(async () => {
      // Opening a chat is not a pick: the default moves only when it held the same old model.
      if (this.deps.defaults.choice(agent).model === choice.model) await this.deps.defaults.setChoice(agent, next);
      if (this.closed) return;
      await this.apply(next);
    });
  }

  /** The chat's agent takes `choice` from its next turn. */
  private async apply(choice: ModelChoice): Promise<void> {
    this.choices = { ...this.choices, [this.current]: choice };
    this.chat = { ...this.chat, choice };
    this.events.changed();
    await this.session.setModel(choice);
    if (this.closed) return;
    await this.saveIfKept();
  }

  /** An empty chat is not saved yet; its first turn saves what it holds. */
  private async saveIfKept(): Promise<void> {
    if (this.chat.turns.length) await this.deps.store.save(this.chat);
  }

  /** One change of agent or model at a time; a failure is shown, not thrown. */
  private async changing(work: () => Promise<void>): Promise<void> {
    this.switching = true;
    try {
      await work();
    } catch (error) {
      this.events.warn(`Could not switch the model: ${messageOf(error)}`);
    } finally { this.switching = false; }
  }
}
