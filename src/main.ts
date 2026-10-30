import { FileSystemAdapter, Notice, Plugin } from 'obsidian';

import { AGENT_IDS, createAgents, PROVIDERS } from '@/agents/providers';
import type { AgentAdapter, AgentId, AuthState, ModelOption } from '@/agents/types';
import { Chat, type ChatEvents } from '@/chat/Chat';
import { ChatDefaults } from '@/chat/ChatDefaults';
import { type ChatRecord, newChat } from '@/chat/ChatRecord';
import { ChatPicker } from '@/chat/obsidian/ChatPicker';
import { ChatStore } from '@/chat/ChatStore';
import { ClewSettingTab, obsidianUserEnv } from '@/settings/obsidian/ClewSettingTab';
import { highlightMarks } from '@/tour/obsidian/highlightMarks';
import { playLayoutDemo } from '@/chat/obsidian/playLayoutDemo';
import { playVisualsDemo } from '@/chat/obsidian/playVisualsDemo';
import { playApprovalDemo } from '@/chat/obsidian/playApprovalDemo';
import { playHighlightDemo } from '@/chat/obsidian/playHighlightDemo';
import { NoteHighlights } from '@/tour/obsidian/NoteHighlights';
import { HighlightTour } from '@/tour/HighlightTour';
import { VaultFileIndex } from '@/attachments/obsidian/VaultFileIndex';
import { vaultChatFiles } from '@/chat/obsidian/vaultChatFiles';
import { VaultAttachments } from '@/attachments/obsidian/VaultAttachments';
import { ChatView, VIEW_TYPE_CHAT } from '@/chat/obsidian/ChatView';
import { figureSandbox } from '@/renderer/figure/FigureSandbox';

const AUTH_LABELS: Record<AuthState, string> = {
  'logged-in': 'signed in',
  'logged-out': 'not signed in',
  missing: 'not installed',
};

export default class ClewPlugin extends Plugin {
  private defaults!: ChatDefaults;
  private agents!: Record<AgentId, AgentAdapter>;
  private models!: Record<AgentId, Promise<ModelOption[]>>;
  files!: VaultFileIndex;
  images!: VaultAttachments;
  tour!: HighlightTour;
  private stage!: NoteHighlights;
  private chats!: ChatStore;

  async onload(): Promise<void> {
    const userEnv = obsidianUserEnv(this.app, () => this.restartChats());
    this.agents = createAgents(() => userEnv.resolve());
    this.models = this.discoverModels(this.agents);
    this.defaults = new ChatDefaults(await this.loadData(), (data) => this.saveData(data));
    this.addSettingTab(new ClewSettingTab(this.app, this, userEnv));
    const pluginDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    this.chats = new ChatStore(vaultChatFiles(this.app.vault.adapter, `${pluginDir}/chats`));

    this.files = new VaultFileIndex(this.app, this);
    this.stage = new NoteHighlights(this.app, {
      stop: () => this.tour.stop(),
      hold: (held) => this.tour.hold(held),
    });
    this.tour = new HighlightTour(this.stage);
    this.registerEditorExtension(highlightMarks);
    this.images = new VaultAttachments(this.app.vault.adapter, `${pluginDir}/attachments`);
    // An image pasted into a chat that never got a message would stay forever, so clear those once the workspace is up.
    this.app.workspace.onLayoutReady(() => void this.chats.chatIds().then((ids) => this.images.sweep(new Set(ids))).catch(() => undefined));

    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this, this.chats));
    this.addRibbonIcon('messages-square', 'Open Clew chat', () => void this.openChat());
    this.addCommand({ id: 'open-chat', name: 'Open chat', callback: () => void this.openChat() });
    this.addCommand({ id: 'new-chat', name: 'New chat', callback: () => void this.openChat({ fresh: true }) });
    this.addCommand({ id: 'open-previous-chat', name: 'Open previous chat', callback: () => void this.pickChat() });
    this.addCommand({
      id: 'play-highlight-demo',
      name: 'Play highlight demo',
      callback: () => void playHighlightDemo(this.app, () => this.openFreshChat()),
    });
    this.addCommand({
      id: 'play-visuals-demo',
      name: 'Play visuals demo',
      callback: () => void playVisualsDemo(this.app, () => this.openFreshChat()),
    });
    this.addCommand({
      id: 'play-figure-layout-demo',
      name: 'Play figure layout demo',
      callback: () => void playLayoutDemo(this.app, () => this.openFreshChat()),
    });
    this.addCommand({
      id: 'play-approval-demo',
      name: 'Play approval demo',
      callback: () => void playApprovalDemo(() => this.openFreshChat()),
    });
    this.addCommand({
      id: 'check-agent-sign-in',
      name: 'Check agent sign-in',
      callback: () => void this.reportAuthState(),
    });
  }

  /** A running agent keeps the environment it started with, so each open chat opens a new session. A tab not loaded yet starts with the new one. */
  private restartChats(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)) {
      if (leaf.view instanceof ChatView) void leaf.view.restartSession();
    }
  }

  onunload(): void {
    this.stage.destroy();
    figureSandbox.destroy();
  }

  /** Waits for the workspace so the CLI processes do not slow Obsidian's startup. */
  private discoverModels(agents: Record<AgentId, AgentAdapter>): Record<AgentId, Promise<ModelOption[]>> {
    const ready = new Promise<void>((resolve) => this.app.workspace.onLayoutReady(resolve));
    const models = (id: AgentId): Promise<ModelOption[]> => ready
      .then(() => agents[id].models())
      .catch((error: unknown) => {
        console.error(`Clew: could not list ${PROVIDERS[id].name} models`, error);
        return [];
      });
    return Object.fromEntries(AGENT_IDS.map((id) => [id, models(id)])) as Record<AgentId, Promise<ModelOption[]>>;
  }

  createChat(id: string, saved: ChatRecord | null, events: ChatEvents): Chat {
    const vault = this.app.vault.adapter;
    return new Chat(saved ?? newChat(id, this.defaults.agent), {
      defaults: this.defaults, agents: this.agents, models: this.models, store: this.chats,
      cwd: vault instanceof FileSystemAdapter ? vault.getBasePath() : '',
    }, events);
  }

  /** Opens a fresh chat for a scripted demo in the existing Clew pane. */
  private async openFreshChat(): Promise<ChatView | null> {
    await this.openChat({ fresh: true });
    const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0]?.view;
    return view instanceof ChatView ? view : null;
  }

  async openChat(options: { chatId?: string; fresh?: boolean } = {}): Promise<void> {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    // Two tabs on one chat would share one conversation in the agent. A tab not yet loaded still reports its chat in its state.
    const open = options.chatId ? leaves.find((leaf) => {
      const state = leaf.getViewState().state;
      return (leaf.view instanceof ChatView && leaf.view.hasChat(options.chatId!))
        || state?.chatId === options.chatId
        || (Array.isArray(state?.chatIds) && state.chatIds.includes(options.chatId));
    }) : undefined;
    const leaf = open ?? leaves[0] ?? workspace.getRightLeaf(false);
    if (!leaf) return;
    const existing = leaves.includes(leaf);
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true, state: options.chatId ? { chatId: options.chatId } : {} });
    if (existing) await leaf.loadIfDeferred();
    await workspace.revealLeaf(leaf);
    if (existing && leaf.view instanceof ChatView) await leaf.view.openChat(options);
  }

  async pickChat(): Promise<void> {
    const chats = await this.chats.list();
    if (!chats.length) {
      new Notice('No saved chats yet.');
      return;
    }
    new ChatPicker(this.app, chats, {
      open: (chatId) => void this.openChat({ chatId }),
      remove: (chatId) => this.deleteChat(chatId),
    }).open();
  }

  /** Stops and closes the chat before deleting its file and images. The CLI's own history stays. */
  private async deleteChat(chatId: string): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)) {
      await leaf.loadIfDeferred();
      if (leaf.view instanceof ChatView) await leaf.view.closeChat(chatId);
    }
    await this.chats.remove(chatId);
    await this.images.removeChat(chatId);
  }

  private async reportAuthState(): Promise<void> {
    const agents = Object.values(this.agents);
    const states = await Promise.all(agents.map((agent) => agent.authState()));
    new Notice(agents.map((agent, i) => `${PROVIDERS[agent.id].name}: ${AUTH_LABELS[states[i]]}`).join('\n'));
  }
}
