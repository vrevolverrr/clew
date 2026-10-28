import type { ChatSummary } from '@/chat/ChatRecord';
import { chatTabStatus, type ChatTab } from '@/chat/view/ChatTabs';
import { appendAgentIcon } from '@/chat/view/agentIcons';
import { dismissOnOutside, menuLabelId, removeMenu } from '@/chat/view/menuDismiss';
import { formatWhen } from '@/chat/view/chatList';
import { messageOf } from '@/shared/messageOf';

const RECENT = 10;
const GAP = 4;
const CLOSE_DELAY_MS = 200;

export interface HistoryMenuHost {
  /** The saved chats, newest first. */
  chats(): Promise<ChatSummary[]>;
  /** Open chats in the same order as the numbered buttons, including unsaved ones. */
  tabs?(): readonly ChatTab[];
  /** The id of the chat in this tab. */
  current(): string | undefined;
  open(chatId: string): void;
  /** Opens the searchable list of every chat. */
  showAll(): void;
}

/**
 * The recent chats under a header button. It opens when the pointer enters the button (or on a click, for the keyboard)
 * and closes shortly after the pointer leaves both, on Escape, or on a click outside.
 */
export class HistoryMenu {
  private menu: HTMLElement | null = null;
  private closing: number | null = null;
  private unwatch: (() => void) | null = null;
  /** Bumps on each open so a slow list read cannot draw into a menu that has closed or reopened. */
  private generation = 0;
  private focusFirst = false;

  constructor(
    private readonly anchor: HTMLElement,
    private readonly host: HistoryMenuHost,
  ) {
    anchor.setAttr('aria-haspopup', 'menu');
    anchor.setAttr('aria-expanded', 'false');
    anchor.addEventListener('pointerenter', this.onEnter);
    anchor.addEventListener('pointerleave', this.onLeave);
    anchor.addEventListener('click', () => this.open());
    anchor.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      this.focusFirst = true;
      this.open();
      const first = this.menu?.querySelector<HTMLElement>('[role="menuitem"]');
      if (first) { first.focus(); this.focusFirst = false; }
    });
  }

  refresh(): void {
    if (this.menu) void this.draw(this.menu, ++this.generation);
  }

  readonly close = (): void => {
    this.cancelClose();
    const menu = this.menu;
    if (!menu) return;
    this.menu = null;
    this.focusFirst = false;
    this.generation++;
    this.anchor.setAttr('aria-expanded', 'false');
    this.unwatch?.();
    this.unwatch = null;
    removeMenu(menu);
  };

  private open(): void {
    this.cancelClose();
    if (this.menu) return;
    const doc = this.anchor.ownerDocument;
    const rect = this.anchor.getBoundingClientRect();
    const menu = doc.body.createDiv({ cls: 'clew-history-menu', attr: { role: 'menu', 'aria-labelledby': menuLabelId(this.anchor) } });
    menu.style.top = `${rect.bottom + GAP}px`;
    menu.style.right = `${doc.documentElement.clientWidth - rect.right}px`;
    menu.addEventListener('pointerenter', this.onEnter);
    menu.addEventListener('pointerleave', this.onLeave);
    menu.addEventListener('keydown', (event) => {
      const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const index = items.indexOf(doc.activeElement as HTMLElement);
      let next: HTMLElement | undefined;
      if (event.key === 'ArrowDown') next = items[(index + 1) % items.length];
      else if (event.key === 'ArrowUp') next = items[(index + items.length - 1) % items.length];
      else if (event.key === 'Home') next = items[0];
      else if (event.key === 'End') next = items.at(-1);
      else if (event.key === 'Escape') { this.close(); this.anchor.focus(); }
      if (next) { event.preventDefault(); next.focus(); }
    });
    this.menu = menu;
    this.anchor.setAttr('aria-expanded', 'true');
    this.unwatch = dismissOnOutside(this.anchor, menu, this.close);
    void this.draw(menu, ++this.generation);
  }

  private async draw(menu: HTMLElement, generation: number): Promise<void> {
    let chats: ChatSummary[];
    let error = '';
    try {
      chats = await this.host.chats();
    } catch (cause) {
      chats = [];
      error = `Could not load recent chats: ${messageOf(cause)}`;
    }
    if (generation !== this.generation) return;
    const focused = menu.contains(menu.ownerDocument.activeElement) ? (menu.ownerDocument.activeElement as HTMLElement).dataset.chatId : undefined;
    menu.empty();
    const tabs = this.host.tabs?.() ?? [];
    const current = this.host.current();
    const row = (chat: Pick<ChatSummary, 'id' | 'title' | 'agent'>, number?: number, tab?: ChatTab): HTMLElement => {
      const title = chat.title || 'New chat';
      const button = menu.createEl('button', {
        cls: 'clew-history-row',
        attr: { type: 'button', role: 'menuitem', title, 'data-chat-id': chat.id, ...(chat.id === current ? { 'aria-current': 'true' } : {}) },
      });
      if (number !== undefined) button.createSpan({ cls: 'clew-history-number', text: String(number) });
      appendAgentIcon(button, chat.agent);
      button.createSpan({ cls: 'clew-history-title', text: title });
      if (tab) {
        const status = chatTabStatus(tab);
        if (status) button.createSpan({ cls: 'clew-history-status', text: status });
      }
      button.addEventListener('click', () => { this.close(); this.host.open(chat.id); });
      return button;
    };
    if (tabs.length) {
      menu.createDiv({ cls: 'clew-history-group', text: 'Open chats' });
      tabs.forEach((tab, index) => row(tab, index + 1, tab));
    }
    const recent = chats.filter((chat) => !tabs.some((tab) => tab.id === chat.id)).slice(0, RECENT);
    if (!tabs.length && !recent.length) {
      menu.createDiv({ cls: 'clew-history-empty', text: error || 'No saved chats yet.' });
      return;
    }
    if (tabs.length && recent.length) menu.createDiv({ cls: 'clew-history-group', text: 'Recent chats' });
    for (const chat of recent) row(chat).createSpan({ cls: 'clew-history-when', text: formatWhen(chat.updatedAt, Date.now()) });
    if (error) menu.createDiv({ cls: 'clew-history-empty', text: error });
    const all = menu.createEl('button', { cls: 'clew-history-all', text: 'Show all chats', attr: { type: 'button', role: 'menuitem', 'data-chat-id': 'all' } });
    all.addEventListener('click', () => {
      this.close();
      this.host.showAll();
    });
    if (this.focusFirst) {
      menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      this.focusFirst = false;
    } else if (focused) [...menu.querySelectorAll<HTMLElement>('[data-chat-id]')].find((item) => item.dataset.chatId === focused)?.focus();
  }

  private cancelClose(): void {
    if (this.closing === null) return;
    window.clearTimeout(this.closing);
    this.closing = null;
  }

  private readonly onEnter = (): void => {
    if (this.menu) this.cancelClose();
    else this.open();
  };

  private readonly onLeave = (): void => {
    this.cancelClose();
    this.closing = window.setTimeout(this.close, CLOSE_DELAY_MS);
  };
}
