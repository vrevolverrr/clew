import type { App } from 'obsidian';
import { Modal, Notice, setIcon, TextComponent } from 'obsidian';

import { appendAgentIcon } from '@/chat/view/agentIcons';
import type { ChatSummary } from '@/chat/ChatRecord';
import type { ChatMatch } from '@/chat/view/chatList';
import { formatWhen, groupByDay, searchChats } from '@/chat/view/chatList';
import { canAnimate } from '@/shared/view/iconButtons';
import { messageOf } from '@/shared/messageOf';

/** Rows drawn at first and per scroll to the bottom, so a long history costs a screenful of DOM, not all of it. */
const PAGE = 50;
const NEAR_BOTTOM_PX = 200;

export interface ChatPickerActions {
  open(chatId: string): void;
  remove(chatId: string): Promise<void>;
}

/** Every saved chat, grouped by day, with search over titles and conversations and a delete on each row. */
export class ChatPicker extends Modal {
  private inputEl!: HTMLInputElement;
  private listEl!: HTMLElement;
  /** Every match in display order, with the day heading each sits under (empty for a search); only the first `drawn` have rows. */
  private entries: { chat: ChatMatch; label: string }[] = [];
  private rows: { chat: ChatMatch; el: HTMLElement }[] = [];
  private drawn = 0;
  private lastLabel = '';
  private active = 0;
  /** The chat whose delete awaits a second click. */
  private confirming: string | null = null;

  constructor(
    app: App,
    private chats: ChatSummary[],
    private readonly actions: ChatPickerActions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.removeClass('modal');
    this.modalEl.addClass('prompt', 'clew-chat-modal');
    this.modalEl.empty();
    this.modalEl.setAttribute('aria-label', 'All chats');
    const header = this.modalEl.createDiv({ cls: 'prompt-input-container mod-raised' });
    const search = new TextComponent(header).setPlaceholder('Search chats');
    this.inputEl = search.inputEl;
    this.inputEl.addClass('prompt-input');
    this.inputEl.setAttribute('aria-label', 'Search chats');
    this.inputEl.setAttribute('spellcheck', 'false');
    const clear = header.createDiv({ cls: 'search-input-clear-button', attr: { role: 'button', tabindex: '0', 'aria-label': 'Close' } });
    const clearOrClose = (): void => {
      if (!this.inputEl.value) { this.close(); return; }
      search.setValue('');
      this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      this.inputEl.focus();
    };
    clear.addEventListener('mousedown', (event) => { if (this.inputEl.value) event.preventDefault(); });
    clear.addEventListener('click', clearOrClose);
    clear.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      clearOrClose();
    });
    this.contentEl = this.listEl = this.modalEl.createDiv({ cls: 'prompt-results clew-chat-list', attr: { role: 'listbox' } });
    search.onChange(() => {
      clear.setAttribute('aria-label', this.inputEl.value ? 'Clear search' : 'Close');
      this.active = 0;
      this.drawn = 0;
      this.cancelDelete();
    });
    this.listEl.addEventListener('scroll', () => {
      if (this.listEl.scrollTop + this.listEl.clientHeight >= this.listEl.scrollHeight - NEAR_BOTTOM_PX) this.drawMore();
    });
    this.inputEl.addEventListener('keydown', (event) => this.onKey(event));
    const instructions = this.modalEl.createDiv({ cls: 'prompt-instructions' });
    for (const [command, purpose] of [['↑↓', 'to navigate'], ['↵', 'to open'], ['esc', 'to dismiss']]) {
      const instruction = instructions.createDiv({ cls: 'prompt-instruction' });
      instruction.createSpan({ cls: 'prompt-instruction-command', text: command });
      instruction.createSpan({ text: purpose });
    }
    this.render();
    this.inputEl.focus();
  }

  onClose(): void {
    this.modalEl.empty();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.confirming) this.cancelDelete();
      else this.setActive(this.active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && this.rows[this.active]) {
      event.preventDefault();
      this.choose(this.rows[this.active].chat);
    }
  }

  private setActive(index: number): void {
    while (index >= this.rows.length && this.drawn < this.entries.length) this.drawMore();
    if (!this.rows.length) return;
    this.rows[this.active]?.el.removeClass('is-active');
    this.active = Math.min(Math.max(index, 0), this.rows.length - 1);
    const { el } = this.rows[this.active];
    el.addClass('is-active');
    el.scrollIntoView({ block: 'nearest' });
  }

  private render(): void {
    const scroll = this.listEl.scrollTop;
    // A redraw after a delete or cancel keeps as many rows as were showing, so the list does not jump.
    const keep = Math.max(this.drawn, PAGE);
    this.listEl.empty();
    this.rows = [];
    this.drawn = 0;
    this.lastLabel = '';
    const query = this.inputEl.value.trim();
    const matches = searchChats(this.chats, query);
    if (!matches.length) {
      this.entries = [];
      this.listEl.createDiv({ cls: 'clew-chat-empty', text: query ? 'No chats match.' : 'No saved chats.' });
      return;
    }
    // Groups by day suit browsing; a search lists its matches as one run.
    const groups = query ? [{ label: '', items: matches }] : groupByDay(matches, Date.now());
    this.entries = groups.flatMap(({ label, items }) => items.map((chat) => ({ chat, label })));
    this.drawMore(keep);
    this.active = Math.min(this.active, this.rows.length - 1);
    this.rows[this.active]?.el.addClass('is-active');
    this.listEl.scrollTop = scroll;
  }

  private drawMore(count = PAGE): void {
    const now = Date.now();
    const end = Math.min(this.drawn + count, this.entries.length);
    for (; this.drawn < end; this.drawn++) {
      const { chat, label } = this.entries[this.drawn];
      if (label !== this.lastLabel) {
        this.listEl.createDiv({ cls: 'clew-chat-group', text: label });
        this.lastLabel = label;
      }
      this.rows.push({ chat, el: this.drawRow(chat, now) });
    }
  }

  private drawRow(chat: ChatMatch, now: number): HTMLElement {
    const title = chat.title || 'Untitled chat';
    const row = this.listEl.createDiv({ cls: 'clew-chat-row', attr: { role: 'option' } });
    if (this.confirming === chat.id) {
      // The row becomes the question, so the buttons do not squeeze the title or move the date.
      row.addClass('is-confirming');
      row.createDiv({ cls: 'clew-chat-confirm-text', text: `Delete “${title}”?` });
      const confirm = row.createDiv({ cls: 'clew-chat-confirm' });
      confirm.createEl('button', { cls: 'mod-warning', text: 'Delete', attr: { type: 'button' } }).addEventListener('click', () => void this.remove(chat, row));
      confirm.createEl('button', { text: 'Cancel', attr: { type: 'button' } }).addEventListener('click', () => this.cancelDelete());
      return row;
    }

    const open = row.createEl('button', { cls: 'clew-chat-open', attr: { type: 'button' } });
    appendAgentIcon(open, chat.agent);
    const text = open.createDiv({ cls: 'clew-chat-text' });
    text.createDiv({ cls: 'clew-chat-title', text: title });
    if (chat.snippet) text.createDiv({ cls: 'clew-chat-snippet', text: chat.snippet });
    open.createSpan({ cls: 'clew-chat-when', text: formatWhen(chat.updatedAt, now) });
    open.addEventListener('click', () => this.choose(chat));

    // The trash sits over the date, which it replaces while the pointer is on the row.
    const trash = row.createEl('button', { cls: 'clickable-icon clew-chat-delete', attr: { type: 'button', 'aria-label': 'Delete chat' } });
    setIcon(trash, 'trash-2');
    trash.addEventListener('click', () => {
      this.confirming = chat.id;
      this.render();
    });
    return row;
  }

  private cancelDelete(): void {
    this.confirming = null;
    this.render();
  }

  private choose(chat: ChatSummary): void {
    this.close();
    this.actions.open(chat.id);
  }

  private async remove(chat: ChatSummary, row: HTMLElement): Promise<void> {
    for (const button of Array.from(row.querySelectorAll('button'))) button.disabled = true;
    try {
      await this.actions.remove(chat.id);
    } catch (error) {
      new Notice(`Could not delete the chat: ${messageOf(error)}`);
      this.cancelDelete();
      return;
    }
    await this.collapse(chat, row);
    this.chats = this.chats.filter(({ id }) => id !== chat.id);
    this.cancelDelete();
  }

  /** Folds the row away, and its day heading with it when it was the last chat under that heading. */
  private async collapse(chat: ChatSummary, row: HTMLElement): Promise<void> {
    if (!canAnimate(row)) return;
    const label = this.entries.find((entry) => entry.chat.id === chat.id)?.label;
    const alone = label && !this.entries.some((entry) => entry.label === label && entry.chat.id !== chat.id);
    const heading = alone && row.previousElementSibling?.hasClass('clew-chat-group') ? row.previousElementSibling as HTMLElement : null;
    await Promise.all([row, ...(heading ? [heading] : [])].map(fold));
  }
}

function fold(el: HTMLElement): Promise<unknown> {
  const { paddingTop, paddingBottom } = getComputedStyle(el);
  el.addClass('clew-folding');
  return el.animate(
    [
      { height: `${el.offsetHeight}px`, paddingTop, paddingBottom, opacity: 1 },
      { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 },
    ],
    { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
  ).finished;
}
