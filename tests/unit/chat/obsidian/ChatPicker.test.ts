/**
 * @jest-environment jsdom
 */
import type { ChatSummary } from '@/chat/ChatRecord';
import type { ChatPickerActions } from '@/chat/obsidian/ChatPicker';
import { ChatPicker } from '@/chat/obsidian/ChatPicker';

jest.mock(
  'obsidian',
  () => ({
    Modal: class {
      contentEl = document.createElement('div');
      modalEl = document.createElement('div');
      close = jest.fn();
    },
    TextComponent: class {
      inputEl: HTMLInputElement;
      constructor(container: HTMLElement) { this.inputEl = container.createEl('input', { attr: { type: 'text' } }); }
      setPlaceholder(value: string): this { this.inputEl.placeholder = value; return this; }
      setValue(value: string): this { this.inputEl.value = value; return this; }
      onChange(callback: (value: string) => void): this { this.inputEl.addEventListener('input', () => callback(this.inputEl.value)); return this; }
    },
    Notice: jest.fn(),
    setIcon: jest.fn(),
  }),
  { virtual: true },
);
jest.mock('@/chat/view/agentIcons', () => ({ appendAgentIcon: jest.fn() }));

const HOUR = 3_600_000;

// jsdom does not implement scrolling.
HTMLElement.prototype.scrollIntoView = jest.fn();

function chats(count: number, text = ''): ChatSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    agent: 'claude' as const,
    title: `Chat ${i}`,
    updatedAt: Date.now() - i * 5 * HOUR,
    text,
  }));
}

function open(list: ChatSummary[], actions: Partial<ChatPickerActions> = {}) {
  const full: ChatPickerActions = { open: jest.fn(), remove: jest.fn(async () => undefined), ...actions };
  const picker = new ChatPicker({} as never, list, full);
  picker.onOpen();
  const el = picker.modalEl;
  document.body.appendChild(el);
  const input = el.querySelector<HTMLInputElement>('.prompt-input')!;
  const listEl = el.querySelector<HTMLElement>('.clew-chat-list')!;
  return {
    picker,
    actions: full,
    input,
    listEl,
    titles: () => [...el.querySelectorAll('.clew-chat-row .clew-chat-title')].map((t) => t.textContent),
    rows: () => el.querySelectorAll('.clew-chat-row').length,
    headings: () => [...el.querySelectorAll('.clew-chat-group')].map((h) => h.textContent),
    search: (query: string) => {
      input.value = query;
      input.dispatchEvent(new Event('input'));
    },
    key: (key: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true })),
  };
}

describe('ChatPicker', () => {
  it('keeps the native search header outside the scrollable results', () => {
    const view = open(chats(3));
    expect(view.picker.modalEl.classList.contains('prompt')).toBe(true);
    expect(view.input.placeholder).toBe('Search chats');
    expect(view.input.parentElement!.classList.contains('prompt-input-container')).toBe(true);
    expect(view.listEl.contains(view.input)).toBe(false);
    expect(view.listEl.classList.contains('prompt-results')).toBe(true);
    expect(view.picker.modalEl.querySelector('.prompt-instructions')?.textContent).toContain('to navigate');
  });

  it('clears a search from the header control and closes when the query is already empty', () => {
    const view = open(chats(3));
    view.search('Chat 2');
    expect(view.titles()).toEqual(['Chat 2']);
    const clear = view.picker.modalEl.querySelector<HTMLElement>('.search-input-clear-button')!;
    expect(clear.getAttribute('aria-label')).toBe('Clear search');
    clear.click();
    expect(view.input.value).toBe('');
    expect(document.activeElement).toBe(view.input);
    expect(view.titles()).toEqual(['Chat 0', 'Chat 1', 'Chat 2']);
    expect(view.picker.close).not.toHaveBeenCalled();
    clear.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(view.picker.close).toHaveBeenCalledTimes(1);
  });
  it('draws one page of a long history, then the next when the list is scrolled to the bottom', () => {
    const view = open(chats(120));
    expect(view.rows()).toBe(50);

    view.listEl.dispatchEvent(new Event('scroll'));
    expect(view.rows()).toBe(100);

    view.listEl.dispatchEvent(new Event('scroll'));
    view.listEl.dispatchEvent(new Event('scroll'));
    expect(view.rows()).toBe(120);
  });

  it('draws more rows when the arrow keys run past the last drawn one', () => {
    const view = open(chats(120));
    for (let i = 0; i < 60; i++) view.key('ArrowDown');

    expect(view.rows()).toBe(100);
    view.key('Enter');
    expect(view.actions.open).toHaveBeenCalledWith('id-60');
  });

  it('puts a day heading above each group once, even when a group spans pages', () => {
    const view = open(chats(120));
    view.listEl.dispatchEvent(new Event('scroll'));

    const headings = view.headings();
    expect(headings.length).toBeGreaterThan(1);
    expect(new Set(headings).size).toBe(headings.length);
  });

  it('lists search matches as one run without headings, and restarts at the first page', () => {
    const view = open(chats(120, 'about hash joins'));
    view.listEl.dispatchEvent(new Event('scroll'));

    view.search('joins');

    expect(view.headings()).toEqual([]);
    expect(view.rows()).toBe(50);
  });

  it('shows the text around a match that is not in the title', () => {
    const list = chats(1, 'we compared hash joins with nested loops');
    const view = open(list);

    view.search('nested');

    expect(view.listEl.querySelector('.clew-chat-snippet')?.textContent).toContain('hash joins with nested loops');
  });

  it('says so when nothing matches', () => {
    const view = open(chats(3));
    view.search('zzz');
    expect(view.listEl.querySelector('.clew-chat-empty')?.textContent).toBe('No chats match.');
  });

  it('asks before deleting, and keeps the rows that were showing after the delete', async () => {
    const view = open(chats(120));
    view.listEl.dispatchEvent(new Event('scroll'));

    view.listEl.querySelector<HTMLElement>('.clew-chat-delete')!.click();
    expect(view.listEl.querySelector('.clew-chat-confirm-text')?.textContent).toBe('Delete “Chat 0”?');
    expect(view.actions.remove).not.toHaveBeenCalled();

    view.listEl.querySelector<HTMLElement>('.is-confirming .mod-warning')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(view.actions.remove).toHaveBeenCalledWith('id-0');
    expect(view.titles()[0]).toBe('Chat 1');
    expect(view.rows()).toBe(100);
  });

  it('keeps the chat and the row when the delete fails', async () => {
    const view = open(chats(3), { remove: jest.fn(async () => Promise.reject(new Error('locked'))) });

    view.listEl.querySelector<HTMLElement>('.clew-chat-delete')!.click();
    view.listEl.querySelector<HTMLElement>('.is-confirming .mod-warning')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(view.titles()).toEqual(['Chat 0', 'Chat 1', 'Chat 2']);
  });

  it('cancels a pending delete with Cancel or an arrow key', () => {
    const view = open(chats(3));
    view.listEl.querySelector<HTMLElement>('.clew-chat-delete')!.click();
    view.listEl.querySelector<HTMLElement>('.is-confirming button:not(.mod-warning)')!.click();
    expect(view.listEl.querySelector('.is-confirming')).toBeNull();

    view.listEl.querySelector<HTMLElement>('.clew-chat-delete')!.click();
    view.key('ArrowDown');
    expect(view.listEl.querySelector('.is-confirming')).toBeNull();
  });
});
