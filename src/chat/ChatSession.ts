import { type AgentAdapter, type AgentSession, ConversationNotFoundError, type PermissionPolicy, type SkillOption } from '@/agents/types';
import { buildSystemPrompt } from '@/context/systemPrompt';
import type { ModelChoice } from '@/chat/ChatDefaults';

/** The chat's warm agent session for one agent, opened on first use and resuming the chat's earlier conversation when it has one. */
export class ChatSession {
  private session: Promise<AgentSession> | null = null;
  /** Names the system prompt the open session runs under; undefined until a session has opened. */
  promptId: string | undefined;

  constructor(
    private readonly agent: AgentAdapter,
    private readonly choice: () => ModelChoice,
    private readonly options: {
      /** The vault folder the agent runs in. */
      cwd: string;
      /** The `AgentSession.id` of the conversation to continue. */
      resume?: string;
      /** Called once the session has opened without the conversation, because the CLI no longer has it. */
      onLost?: () => void;
      permissionPolicy?: PermissionPolicy;
    },
  ) {}

  /** The open session, opening one for the current agent if none is; a failed open is retried next time. */
  open(): Promise<AgentSession> {
    this.session ??= this.start().catch((error: unknown) => {
      this.session = null;
      throw error;
    });
    return this.session;
  }

  async close(): Promise<void> {
    const session = this.session;
    this.session = null;
    await session?.then((open) => open.close()).catch(() => undefined);
  }

  /** The CLI's skills, or none if the session cannot open. */
  skills(): Promise<SkillOption[]> {
    return this.open().then((session) => session.skills()).catch(() => []);
  }

  /** Applies a model to the open session from its next turn; a session not yet open starts with the saved choice. */
  async setModel({ model, effort }: ModelChoice): Promise<void> {
    const session = await this.session?.catch(() => null);
    await session?.setModel(model, effort);
  }

  private async start(): Promise<AgentSession> {
    const { model, effort } = this.choice();
    const { agent } = this;
    const { cwd, resume: saved, onLost, permissionPolicy } = this.options;
    const open = (resume?: string): Promise<AgentSession> => {
      const systemPrompt = buildSystemPrompt();
      this.promptId = promptHash(systemPrompt);
      return agent.openSession({ systemPrompt, model, effort, cwd, resume, permissionPolicy });
    };
    if (!saved) return open();
    try {
      return await open(saved);
    } catch (error) {
      if (!(error instanceof ConversationNotFoundError)) throw error;
      // The CLI cleans up old conversations; the chat goes on with a new one, and the student is told.
      const session = await open();
      onLost?.();
      return session;
    }
  }
}

/** A short name for a system prompt's exact text, so a saved turn says which prompt wrote it. */
function promptHash(prompt: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) hash = Math.imul(hash ^ prompt.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
