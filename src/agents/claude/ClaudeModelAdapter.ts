import type { EffortLevel, Options, Query } from '@anthropic-ai/claude-agent-sdk';
import { type AgentModelAdapter, type AgentModelSelection, latestPerFamily } from '@/agents/adapters';
import type { Effort, ModelOption } from '@/agents/types';

/** Adapts an existing SDK connection to normalized model operations. */
export class ClaudeModelAdapter implements AgentModelAdapter {
  constructor(private readonly query: Pick<Query, 'supportedModels' | 'setModel' | 'applyFlagSettings'>) {}

  async listModels(): Promise<ModelOption[]> {
    const rows = await this.query.supportedModels();
    const listed = rows.filter((row) => row.value !== 'default');
    const resolvedDefault = rows.find((row) => row.value === 'default')?.resolvedModel;
    const versioned = listed.map((row) => {
      const [, name = row.displayName, version = ''] = /^(.*?)\s+(\d+(?:\.\d+)*)$/.exec(row.displayName) ?? [];
      return { id: row.value, name, version, efforts: row.supportedEffortLevels ?? [] };
    });
    return latestPerFamily(versioned, listed.find((row) => row.resolvedModel === resolvedDefault)?.value);
  }

  static initial(model?: string, effort?: Effort): Pick<Options, 'model' | 'effort'> {
    return { model, effort: effort as EffortLevel | undefined };
  }

  async setModel(model?: string, effort?: Effort): Promise<AgentModelSelection> {
    await this.query.setModel(model);
    await this.query.applyFlagSettings({ effortLevel: (effort ?? null) as EffortLevel | null });
    return { model, effort };
  }
}
