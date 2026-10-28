import { ItemView, Notice, setIcon, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';

import type { AgentSession } from '@/agents/types';
import { ChatPane, type ChatHost } from '@/chat/obsidian/ChatPane';
import { ChatTabs, type ChatTab } from '@/chat/view/ChatTabs';
import { HistoryMenu } from '@/chat/view/HistoryMenu';
import type { Chat, ChatEvents } from '@/chat/Chat';
import type { ChatRecord } from '@/chat/ChatRecord';
import { CHAT_ID } from '@/chat/ChatStore';
import type { ChatStore } from '@/chat/ChatStore';
import { createIconButton } from '@/shared/view/iconButtons';
import { messageOf } from '@/shared/messageOf';

export const VIEW_TYPE_CHAT = 'clew-chat';

interface ChatViewHost extends Pick<ChatHost, 'files' | 'images' | 'tour'> {
  openChat(options: { chatId: string }): Promise<void>;
  pickChat(): Promise<void>;
  createChat(id: string, saved: ChatRecord | null, events: ChatEvents): Chat;
}

/** One Obsidian pane containing independent, concurrently running chats. */
export class ChatView extends ItemView {
  private panes = new Map<string, ChatPane>();
  private readonly opening = new Map<string, Promise<void>>();
  private readonly closing = new Map<string, Promise<void>>();
  private selectionRequest = 0;
  private selected: string | undefined;
  private tabs!: ChatTabs;
  private tabBar!: HTMLElement;
  private history!: HistoryMenu;
  private panels!: HTMLElement;
  private closed = false;
  private opened!: () => void;
  private readonly ready = new Promise<void>((resolve) => { this.opened = resolve; });

  constructor(leaf: WorkspaceLeaf, private readonly host: ChatViewHost, private readonly store: ChatStore) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_CHAT; }
  getIcon(): string { return 'messages-square'; }
  getDisplayText(): string { return this.panes.get(this.selected ?? '')?.chat.record.title || 'Clew'; }
  get chatId(): string | undefined { return this.selected; }

  getState(): Record<string, unknown> {
    return { chatId: this.selected, chatIds: [...this.panes.keys()] };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await this.ready;
    const value = state as { chatId?: unknown; chatIds?: unknown } | null;
    const ids = Array.isArray(value?.chatIds) ? value.chatIds : [value?.chatId];
    for (const id of new Set(ids)) if (typeof id === 'string' && CHAT_ID.test(id)) await this.openChat({ chatId: id }, false);
    if (typeof value?.chatId === 'string' && this.panes.has(value.chatId)) this.select(value.chatId);
    else if (!this.selected && this.panes.size) this.select(this.panes.keys().next().value!);
    if (!this.panes.size && !this.closed) await this.openChat({ fresh: true });
    await super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('clew-chat');
    const header = this.contentEl.createDiv({ cls: 'clew-chat-header' });
    this.panels = this.contentEl.createDiv({ cls: 'clew-chat-panels' });
    this.tabBar = this.panels.createDiv({ cls: 'clew-chat-tab-bar' });
    this.tabs = new ChatTabs(this.tabBar, {
      create: () => void this.openChat({ fresh: true }),
      select: (id) => this.select(id),
      close: (id) => void this.closeChat(id),
    });
    this.register(() => this.tabs.destroy());
    const create = createIconButton(header, 'square-pen', 'New chat') as HTMLButtonElement;
    this.registerDomEvent(create, 'click', () => {
      create.disabled = true;
      void this.replaceChat().catch((error: unknown) => {
        new Notice(`Could not start a new chat: ${messageOf(error)}`);
      }).finally(() => { create.disabled = false; });
    });
    const history = header.createEl('button', { cls: 'clew-icon-action clickable-icon clew-history-button', attr: { type: 'button' } });
    setIcon(history, 'history');
    history.createSpan({ cls: 'clew-visually-hidden', text: 'Open and recent chats' });
    this.history = new HistoryMenu(history, {
      chats: () => this.store.list(),
      tabs: () => this.openTabs(),
      current: () => this.selected,
      open: (chatId) => void this.host.openChat({ chatId }),
      showAll: () => void this.host.pickChat(),
    });
    this.opened();
    const timer = window.setTimeout(() => {
      if (!this.panes.size && !this.opening.size && !this.closed) void this.openChat({ fresh: true });
    }, 0);
    this.register(() => window.clearTimeout(timer));
  }

  hasChat(id: string): boolean { return this.panes.has(id) || this.opening.has(id) || this.closing.has(id); }

  async openChat(options: { chatId?: string; fresh?: boolean } = {}, select = true): Promise<void> {
    await this.ready;
    if (this.closed) return;
    const id = options.chatId ?? (options.fresh ? crypto.randomUUID() : this.selected ?? crypto.randomUUID());
    if (!CHAT_ID.test(id)) return;
    await this.closing.get(id);
    if (this.closed) return;
    const request = select ? ++this.selectionRequest : this.selectionRequest;
    let pending = this.opening.get(id);
    if (!this.panes.has(id) && !pending) {
      pending = this.createPane(id);
      this.opening.set(id, pending);
    }
    try { await pending; }
    finally { if (this.opening.get(id) === pending) this.opening.delete(id); }
    if (!this.closed && this.panes.has(id) && select && request === this.selectionRequest) {
      this.select(id);
      this.panes.get(id)!.focus();
    }
  }

  private async replaceChat(): Promise<void> {
    const previous = this.selected;
    const id = crypto.randomUUID();
    const request = ++this.selectionRequest;
    await this.openChat({ chatId: id }, false);
    if (this.closed || !this.panes.has(id)) return;
    const entries = [...this.panes];
    const replacement = entries.find(([key]) => key === id)!;
    this.panes = new Map(entries.flatMap((entry) => entry[0] === id ? []
      : entry[0] === previous ? [replacement, entry] : [entry]));
    if (!previous || !this.panes.has(previous)) this.panes.set(...replacement);
    if (request === this.selectionRequest) this.select(id);
    if (previous) await this.closeChat(previous);
    if (this.selected === id) this.panes.get(id)?.focus();
  }

  private async createPane(id: string): Promise<void> {
    let record: ChatRecord | null;
    try { record = await this.store.load(id); }
    catch (error) {
      new Notice(`Could not open this chat: ${messageOf(error)}`);
      return;
    }
    if (this.closed) return;
    const content = this.panels.createDiv({ cls: 'clew-chat-panel', attr: { id: `clew-panel-${id}`, role: 'tabpanel', 'aria-labelledby': `clew-tab-${id}` } });
    content.hidden = true;
    const pane = new ChatPane(this.app, content, {
      files: this.host.files, images: this.host.images, tour: this.host.tour,
      active: () => this.selected === id && !this.closed,
      changed: () => this.changed(),
    }, (events) => this.host.createChat(id, record, events));
    this.panes.set(id, pane);
    this.addChild(pane);
    this.changed();
  }

  private select(id: string): void {
    if (!this.panes.has(id) || this.closed) return;
    const active = this.contentEl.ownerDocument.activeElement;
    const focused = this.tabBar.contains(active) ? active as HTMLElement : undefined;
    this.selectionRequest++;
    if (this.selected !== id) this.host.tour.reset();
    this.selected = id;
    const selected = this.panes.get(id)!;
    selected.activate(true);
    for (const [key, pane] of this.panes) if (key !== id) pane.activate(false);
    this.changed();
    focused?.focus({ preventScroll: true });
  }

  closeChat(id: string): Promise<void> {
    const existing = this.closing.get(id);
    if (existing) return existing;
    const task = this.finishClose(id).finally(() => this.closing.delete(id));
    this.closing.set(id, task);
    return task;
  }

  private async finishClose(id: string): Promise<void> {
    await this.opening.get(id);
    const pane = this.panes.get(id);
    if (!pane) return;
    if (this.panes.size === 1 && !this.closed) {
      await this.openChat({ fresh: true });
      if (this.panes.size === 1 && !this.closed) return;
    }
    const ids = [...this.panes.keys()];
    const position = ids.indexOf(id);
    this.panes.delete(id);
    const wasSelected = this.selected === id;
    const next = wasSelected ? ids[position + 1] ?? ids[position - 1] : undefined;
    if (wasSelected) this.selected = undefined;
    if (next) this.select(next);
    else {
      if (wasSelected) this.host.tour.reset();
      this.changed();
    }
    await pane.close();
    this.removeChild(pane);
    pane.contentEl.remove();
  }

  private openTabs(): ChatTab[] {
    return [...this.panes.values()].map((pane) => ({
      id: pane.chat.record.id, title: pane.chat.record.title, agent: pane.chat.record.agent,
      running: pane.chat.running, unread: pane.unread, failed: pane.chat.failed,
      waitingForApproval: pane.waitingForApproval,
    }));
  }

  private changed(): void {
    if (this.closed) return;
    this.tabs.set(this.openTabs(), this.selected);
    this.history.refresh();
    (this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
    this.app.workspace.requestSaveLayout();
  }

  async restartSession(): Promise<void> {
    await Promise.all([...this.panes.values()].map((pane) => pane.chat.restart()));
  }

  async playTurn(message: string, session: AgentSession, notePath: string): Promise<void> {
    await this.openChat();
    await this.panes.get(this.selected!)?.playTurn(message, session, notePath);
  }

  async onClose(): Promise<void> {
    this.closed = true;
    this.history.close();
    this.host.tour.reset();
    await Promise.all([...this.panes.values()].map((pane) => pane.close()));
    await Promise.all(this.closing.values());
  }
}
