import { type AgentModelAdapter, type AgentModelSelection, latestPerFamily } from '@/agents/adapters';
import type { Effort, ModelOption } from '@/agents/types';
import type { CodexModel, ModelListResult, ThreadStartResult } from './codexProtocol';

type NativeDefaults = Pick<ThreadStartResult, 'model' | 'reasoningEffort'>;

/** Native defaults and catalogue cache belong to this session's connection. */
export class CodexModelAdapter implements AgentModelAdapter {
  private catalog: Promise<CodexModel[]> | null = null;

  constructor(
    private readonly request: (cursor: string | null) => Promise<ModelListResult>,
    /** A throwaway thread's model and effort: what the user's config.toml picks. */
    private readonly defaults: () => Promise<NativeDefaults>,
  ) {}

  async listModels(): Promise<ModelOption[]> {
    const [rows, { model }] = await Promise.all([this.list(), this.defaults()]);
    const versioned = rows.map((model) => {
      const [, version = '', name = model.displayName] = /^GPT-(\d+(?:\.\d+)*)-(.+)$/.exec(model.displayName) ?? [];
      return { id: model.id, name, version, efforts: model.supportedReasoningEfforts.map((option) => option.reasoningEffort) };
    });
    return latestPerFamily(versioned, rows.some((row) => row.id === model) ? model : rows.find((row) => row.isDefault)?.id);
  }

  private async list(): Promise<CodexModel[]> {
    const models: CodexModel[] = [];
    let cursor: string | null = null;
    do {
      const page = await this.request(cursor);
      models.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);
    return models;
  }

  private catalogue(): Promise<CodexModel[]> {
    return this.catalog ??= this.list().catch((error: unknown) => {
      this.catalog = null;
      throw error;
    });
  }

  async setModel(model?: string, effort?: Effort): Promise<AgentModelSelection> {
    if (model && effort) return { model, effort };
    const [rows, native] = await Promise.all([this.catalogue(), this.defaults()]);
    const selected = model ?? native.model;
    const row = rows.find((option) => option.id === selected);
    const configEffort = native.reasoningEffort ?? undefined;
    // Codex applies the config effort to any model, so one the model rejects would fail the turn.
    const fits = configEffort !== undefined && (!row || row.supportedReasoningEfforts.some((option) => option.reasoningEffort === configEffort));
    return { model: selected, effort: effort ?? (fits ? configEffort : row?.defaultReasoningEffort) };
  }
}
