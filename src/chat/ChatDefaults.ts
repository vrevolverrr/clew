import type { AgentId, Effort } from '@/agents/types';
import { AGENT_IDS, DEFAULT_AGENT, isAgentId } from '@/agents/providers';

/** The picker's choice for one agent; an omitted field is the CLI's own default ("Auto"). */
export interface ModelChoice {
  model?: string;
  /** The model's family, so a newer version replaces `model` once the CLI lists it. */
  name?: string;
  effort?: Effort;
}

interface SavedSelection {
  agent: AgentId;
  choices: Partial<Record<AgentId, ModelChoice>>;
}

/** Which agent a new chat starts with and the model choice kept for each agent, saved whenever either changes. */
export class ChatDefaults {
  private current: AgentId = DEFAULT_AGENT;
  private choices: Partial<Record<AgentId, ModelChoice>> = {};

  constructor(
    saved: unknown,
    private readonly save: (data: SavedSelection) => Promise<void>,
  ) {
    const { agent, choices } = (typeof saved === 'object' && saved !== null ? saved : {}) as Partial<Record<keyof SavedSelection, unknown>>;
    if (isAgentId(agent)) this.current = agent;
    for (const id of AGENT_IDS) {
      const choice = decodeChoice((choices as Record<string, unknown> | undefined)?.[id]);
      if (choice) this.choices[id] = choice;
    }
  }

  get agent(): AgentId {
    return this.current;
  }

  choice(agent: AgentId): ModelChoice {
    return this.choices[agent] ?? {};
  }

  async setAgent(agent: AgentId): Promise<void> {
    this.current = agent;
    await this.persist();
  }

  async setChoice(agent: AgentId, choice: ModelChoice): Promise<void> {
    this.choices[agent] = choice;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.save({ agent: this.current, choices: this.choices });
  }
}

export function decodeChoice(value: unknown): ModelChoice | null {
  if (typeof value !== 'object' || value === null) return null;
  const { model, name, effort } = value as Record<string, unknown>;
  const text = (field: unknown): string | undefined => (typeof field === 'string' ? field : undefined);
  return { model: text(model), name: text(name), effort: text(effort) };
}
