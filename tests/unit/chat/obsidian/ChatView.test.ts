/** @jest-environment jsdom */
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import type { App, DataAdapter, WorkspaceLeaf } from 'obsidian';
import { FileSystemAdapter } from 'obsidian';
import { AsyncQueue } from '@/agents/shared/AsyncQueue';
import type { AgentAdapter, AgentEvent, AgentSession, AgentSessionOptions } from '@/agents/types';
import { ChatView } from '@/chat/obsidian/ChatView';
import { playApprovalDemo } from '@/chat/obsidian/playApprovalDemo';
import { Chat } from '@/chat/Chat';
import { ChatDefaults } from '@/chat/ChatDefaults';
import { newChat } from '@/chat/ChatRecord';
import { ChatStore } from '@/chat/ChatStore';
import { VaultAttachments } from '@/attachments/obsidian/VaultAttachments';
import type { VaultFileIndex } from '@/attachments/obsidian/VaultFileIndex';
import { HighlightTour } from '@/tour/HighlightTour';

jest.mock('obsidian', () => {
  class Component {
    loaded = false;
    children: Component[] = [];
    callbacks: Array<() => void> = [];
    onload(): void {}
    load(): void { if (!this.loaded) { this.loaded = true; this.onload(); } }
    unload(): void { this.children.forEach((child) => child.unload()); this.callbacks.forEach((callback) => callback()); this.loaded = false; }
    addChild<T extends Component>(child: T): T { this.children.push(child); if (this.loaded) child.load(); return child; }
    removeChild<T extends Component>(child: T): T { this.children = this.children.filter((item) => item !== child); child.unload(); return child; }
    register(callback: () => void): void { this.callbacks.push(callback); }
    registerEvent(): void {}
    registerDomEvent(el: EventTarget, type: string, callback: EventListener): void {
      el.addEventListener(type, callback);
      this.register(() => el.removeEventListener(type, callback));
    }
  }
  class ItemView extends Component {
    app: App;
    contentEl = document.body.createDiv();
    constructor(readonly leaf: WorkspaceLeaf & { app: App }) { super(); this.app = leaf.app; }
    async setState(): Promise<void> {}
  }
  class FileSystemAdapter { getBasePath(): string { return '/vault'; } }
  return {
    Component, ItemView, FileView: class extends ItemView {}, MarkdownView: class extends ItemView {}, FileSystemAdapter,
    Modal: class {}, TFile: class {}, TFolder: class {}, Menu: class {},
    Notice: jest.fn(), setIcon: jest.fn(), finishRenderMath: jest.fn(),
    MarkdownRenderer: { render: jest.fn(async (_app, text, el) => { el.textContent = text; }) },
  };
}, { virtual: true });

const settle = async (): Promise<void> => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const views: ChatView[] = [];

function setup() {
  const sessions: Array<AgentSession & { input: string[]; signal?: AbortSignal; events: AsyncQueue<AgentEvent>; options: AgentSessionOptions }> = [];
  const agent: AgentAdapter = {
    id: 'claude', skillSyntax: { prefix: '/', atStart: true }, fileMention: (path) => `@"${path}"`, toolsOnResume: true,
    authState: async () => 'logged-in', models: async () => [],
    openSession: jest.fn(async (options) => {
      const events = new AsyncQueue<AgentEvent>();
      const session = {
        id: `session-${sessions.length}`, input: [] as string[], events, options, signal: undefined as AbortSignal | undefined,
        async *send(text: string, signal?: AbortSignal) {
          session.input.push(text); session.signal = signal;
          const abort = () => { events.push({ type: 'done', status: 'interrupted' }); events.close(); };
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) abort();
          try { yield* events; }
          finally { signal?.removeEventListener('abort', abort); }
        },
        title: async () => 'A conversation', skills: async () => [], setModel: jest.fn(async () => undefined), close: jest.fn(async () => undefined),
      };
      sessions.push(session);
      return session;
    }),
  };
  const defaults = new ChatDefaults({}, async () => undefined);
  const agents = { claude: agent, codex: { ...agent, id: 'codex' as const, skillSyntax: { prefix: '$', atStart: false } } };
  const models = { claude: Promise.resolve([]), codex: Promise.resolve([]) };
  const disk = new Map<string, string>();
  const files = {
    read: async (path: string) => disk.get(path) ?? null,
    write: async (path: string, text: string) => { disk.set(path, text); },
    list: async () => [...disk.keys()],
    remove: async (path: string) => { disk.delete(path); },
  };
  const store = new ChatStore(files);
  const vault = Object.assign(new (jest.requireMock('obsidian').FileSystemAdapter)(), {
    ...files, exists: async (path: string) => disk.has(path), mkdir: async () => undefined,
  });
  const images = new VaultAttachments(vault as DataAdapter, 'attachments');
  const app = { vault: { adapter: vault }, workspace: { getMostRecentLeaf: () => null, rootSplit: {}, on: jest.fn(), requestSaveLayout: jest.fn() } } as unknown as App;
  const stage = { show: jest.fn(async () => true), clear: jest.fn(), timing: jest.fn(), rest: jest.fn() };
  const tour = new HighlightTour(stage);
  const leaf = { app, updateHeader: jest.fn() } as unknown as WorkspaceLeaf;
  const view: ChatView = new ChatView(leaf, {
    files: { find: () => [] } as unknown as VaultFileIndex, images, tour,
    openChat: (options) => view.openChat(options), pickChat: async () => undefined,
    createChat: (id, saved, events) => new Chat(saved ?? newChat(id, defaults.agent), {
      defaults, agents, models, store, cwd: vault instanceof FileSystemAdapter ? vault.getBasePath() : '',
    }, events),
  }, store);
  views.push(view);
  view.load();
  const start = async () => { await view.onOpen(); await view.setState({}, { history: false }); await settle(); };
  const panel = () => view.contentEl.querySelector<HTMLElement>('.clew-chat-panel:not([hidden])')!;
  const input = () => panel().querySelector<HTMLTextAreaElement>('textarea')!;
  const type = (text: string) => { input().value = text; input().dispatchEvent(new Event('input')); };
  const send = (text: string) => { type(text); input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); };
  const select = (index: number) => view.contentEl.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]!.click();
  return { view, start, panel, input, type, send, select, sessions, store, disk, stage, defaults, vault };
}

beforeEach(() => {
  document.body.empty();
  Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
  Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
  globalThis.ResizeObserver = class { observe(): void {} unobserve(): void {} disconnect(): void {} } as unknown as typeof ResizeObserver;
  HTMLElement.prototype.scrollTo = function (options?: ScrollToOptions | number) { if (typeof options === 'object') this.scrollTop = options.top ?? 0; };
});

describe('permission relay', () => {
  const request = { description: 'these file changes', input: { file: 'notes.md' }, fields: [], changes: [] };
  /** Streams an approval on the session's running turn, cancelled with that turn as an adapter's is. */
  const ask = (session: { events: AsyncQueue<AgentEvent>; signal?: AbortSignal }): Promise<boolean> =>
    new Promise((answer) => session.events.push({ type: 'approval', request, signal: session.signal!, answer }));

  it('plays the sample cards through the real chat and records choices without sending to an agent', async () => {
    const { view, start, panel, sessions, store } = setup();
    const frame = async (): Promise<void> => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await settle();
    };
    await start();
    const running = playApprovalDemo(async () => view); await settle(); await frame();
    expect(panel().querySelector('.clew-approval-value')?.textContent).toContain('curl --max-time');
    expect(panel().textContent).toContain('Sample actions do not run commands or change files.');
    panel().querySelectorAll<HTMLButtonElement>('.clew-approval-card button')[0]!.click(); await settle(); await frame();
    expect(panel().textContent).toContain('Denied (demo only).');
    expect(panel().querySelector('.clew-approval-diff-path')?.textContent).toContain('Sorting algorithms.md');
    panel().querySelectorAll<HTMLButtonElement>('.clew-approval-card button')[1]!.click(); await settle(); await frame();
    expect(panel().textContent).toContain('Allowed once (demo only).');
    expect(panel().querySelector('.clew-approval-value')?.textContent).toContain('network');
    panel().querySelectorAll<HTMLButtonElement>('.clew-approval-card button')[0]!.click(); await settle(); await frame();
    expect(panel().querySelector('.clew-question .clew-approval-title')?.textContent).toContain('irrationality of √2');
    panel().querySelector<HTMLButtonElement>('.clew-approval-card .clew-approval-deny')!.click();
    await running;
    expect(panel().textContent).toContain('Skipped (demo only).');
    expect(panel().querySelector<HTMLElement>('.clew-approval-card')!.hidden).toBe(true);
    expect(panel().textContent).toContain('Demo complete.');
    expect(sessions.every((session) => session.input.length === 0)).toBe(true);
    expect((await store.load(view.chatId!))?.turns[0]?.status).toBe('completed');
  });

  it.each(['stop', 'close'] as const)('cancels a pending approval demo on %s without opening the next card', async (action) => {
    const { view, start, panel, store } = setup();
    await start();
    const id = view.chatId!;
    const running = playApprovalDemo(async () => view); await settle();
    const originalPanel = panel();
    const stale = originalPanel.querySelectorAll<HTMLButtonElement>('.clew-approval-card button')[1]!;
    if (action === 'stop') originalPanel.querySelector<HTMLButtonElement>('[aria-label="Stop"]')!.click();
    else await view.closeChat(id);
    await running;
    stale.click(); await settle();
    expect(originalPanel.querySelector<HTMLElement>('.clew-approval-card')!.hidden).toBe(true);
    expect(originalPanel.textContent).not.toContain('Sample 2');
    expect((await store.load(id))?.turns[0]?.status).toBe('interrupted');
  });

  it('keeps a pending card above its own composer across tab switches', async () => {
    const { view, start, panel, send, select, sessions } = setup();
    await start(); send('Edit the note'); await settle();
    const firstPanel = panel();
    const pending = ask(sessions[0]!); await settle();
    const area = firstPanel.querySelector('.clew-chat-composer-area')!;
    const card = firstPanel.querySelector('.clew-approval-card')!;
    expect(card.parentElement).toBe(firstPanel);
    expect(card.nextElementSibling).toBe(area);
    expect(area.contains(card)).toBe(false);
    expect(area.lastElementChild?.className).toBe('clew-composer');
    expect(view.contentEl.querySelector('[role="tab"]')?.getAttribute('aria-label')).toContain('Needs approval');
    await view.openChat({ fresh: true }); await settle();
    expect(panel()).not.toBe(firstPanel);
    expect(panel().querySelector<HTMLElement>('.clew-approval-card')!.hidden).toBe(true);
    select(0);
    expect(panel()).toBe(firstPanel);
    panel().querySelectorAll<HTMLButtonElement>('.clew-approval-card button')[1]!.click();
    expect(await pending).toBe(true);
    expect(panel().querySelector<HTMLElement>('.clew-approval-card')!.hidden).toBe(true);
  });

  it('declines a pending request on Stop and ignores its stale button', async () => {
    const { start, panel, send, sessions } = setup();
    await start(); send('Edit'); await settle();
    const pending = ask(sessions[0]!); await settle();
    const stale = panel().querySelectorAll<HTMLButtonElement>('.clew-approval-card button')[1]!;
    panel().querySelector<HTMLButtonElement>('.clew-send')!.click(); await settle();
    expect(panel().querySelector<HTMLElement>('.clew-approval-card')!.hidden).toBe(true);
    expect(await pending).toBe(false);
    stale.click(); await settle();
    expect(panel().querySelector<HTMLElement>('.clew-approval-card')!.hidden).toBe(true);
  });

  it('saves policy changes and applies them after the current turn, including returning to Inherit', async () => {
    const { start, panel, send, sessions, store, view } = setup();
    const pick = async (name: string) => {
      panel().querySelector<HTMLButtonElement>('[aria-label="Permission policy"]')!.click();
      const option = [...panel().querySelectorAll<HTMLButtonElement>('.clew-picker-option')].find((el) => el.textContent === name)!;
      option.click(); await settle();
    };
    await start(); send('Wait'); await settle();
    await pick('Bypass');
    expect(sessions).toHaveLength(1);
    sessions[0]!.events.push({ type: 'done', status: 'completed' }); sessions[0]!.events.close();
    await settle();
    expect(sessions).toHaveLength(2);
    expect(sessions[1]!.options).toMatchObject({ resume: 'session-0', permissionPolicy: 'bypass' });
    expect((await store.load(view.chatId!))?.permissionPolicy).toBe('bypass');
    await pick('Inherit');
    expect(sessions).toHaveLength(3);
    expect(sessions[2]!.options.permissionPolicy).toBe('inherit');
  });
});

afterEach(async () => {
  for (const view of views.splice(0)) { await view.onClose(); view.unload(); }
  document.getSelection()?.removeAllRanges();
});

describe('concurrent chat tabs', () => {
  it('never detaches the shared tab controls when switching or closing the active chat', async () => {
    const { start, view, select } = setup();
    await start();
    await view.openChat({ fresh: true });
    const strip = view.contentEl.querySelector('.clew-chat-tab-bar')!;
    const parent = strip.parentElement;
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(view.contentEl, { subtree: true, childList: true });
    select(0);
    select(1);
    await view.closeChat(view.chatId!);
    await settle();
    observer.disconnect();
    expect(strip.parentElement).toBe(parent);
    expect(strip.closest('[hidden]')).toBeNull();
    expect(changes.some((record) => [...record.removedNodes].includes(strip))).toBe(false);
  });

  it('keeps the tab strip visible while the last tab is replaced', async () => {
    const { start, view, store, sessions } = setup();
    await start();
    const previous = view.chatId!;
    const strip = view.contentEl.querySelector<HTMLElement>('.clew-chat-tab-bar')!;
    let release!: () => void;
    const opening = new Promise<void>((resolve) => { release = resolve; });
    jest.spyOn(store, 'load').mockImplementationOnce(async () => { await opening; return null; });
    const closing = view.closeChat(previous);
    try {
      await settle();
      expect(strip.isConnected).toBe(true);
      expect(strip.closest('[hidden]')).toBeNull();
      expect(strip.querySelectorAll('[role="tab"]')).toHaveLength(1);
    } finally {
      release();
      await closing;
    }
    expect(view.chatId).not.toBe(previous);
    expect(view.contentEl.querySelector('.clew-chat-tab-bar')).toBe(strip);
    expect(strip.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(sessions[0]!.close).toHaveBeenCalledTimes(1);
  });

  it('adds a tab with the trailing plus and replaces only the selected tab with New chat', async () => {
    const { start, view, type, input, select, send, sessions, store } = setup();
    await start();
    const first = view.chatId!;
    type('First draft');
    const add = view.contentEl.querySelector<HTMLButtonElement>('[aria-label="New tab"]')!;
    add.click();
    await settle();
    const second = view.chatId!;
    expect(second).not.toBe(first);
    expect(input().value).toBe('');
    add.click();
    await settle();
    const third = view.chatId!;
    type('Third draft');
    select(1);
    send('Keep this conversation in history');
    await settle();
    const create = view.contentEl.querySelector<HTMLButtonElement>('.clew-chat-header [aria-label="New chat"]')!;
    create.click();
    create.click();
    expect(create.disabled).toBe(true);
    await settle();
    const replacement = view.chatId!;
    expect(replacement).not.toBe(second);
    expect(view.getState()).toEqual({ chatId: replacement, chatIds: [first, replacement, third] });
    expect(view.hasChat(second)).toBe(false);
    expect(sessions[1]!.signal?.aborted).toBe(true);
    expect(sessions[1]!.close).toHaveBeenCalledTimes(1);
    expect((await store.load(second))?.turns[0]?.status).toBe('interrupted');
    expect(create.disabled).toBe(false);
    expect(input().value).toBe('');
    select(0);
    expect(input().value).toBe('First draft');
    select(2);
    expect(input().value).toBe('Third draft');
  });

  it('replaces the only tab without adding another tab', async () => {
    const { start, view } = setup();
    await start();
    const previous = view.chatId!;
    view.contentEl.querySelector<HTMLButtonElement>('.clew-chat-header [aria-label="New chat"]')!.click();
    await settle();
    expect(view.chatId).not.toBe(previous);
    expect(view.getState()).toEqual({ chatId: view.chatId, chatIds: [view.chatId] });
  });

  it('shows the open-note chip without entrance animation when opening and switching tabs', async () => {
    const { start, view, select, panel } = setup();
    const note = new (jest.requireMock('obsidian').FileView)({ app: view.app });
    Object.assign(note, {
      file: { path: 'Waves.md', name: 'Waves.md', basename: 'Waves', extension: 'md' },
      containerEl: note.contentEl,
      getIcon: () => 'file-text', getViewType: () => 'file',
    });
    jest.spyOn(view.app.workspace, 'getMostRecentLeaf').mockReturnValue({ view: note } as unknown as WorkspaceLeaf);
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    const animate = jest.fn(() => ({ finished: Promise.resolve(), cancel: jest.fn() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    try {
      await start();
      expect(panel().querySelector('.clew-context-label')?.textContent).toBe('Waves');
      expect(animate.mock.instances.filter((el) => (el as unknown as HTMLElement).closest('.clew-context-chip'))).toHaveLength(0);
      await view.openChat({ fresh: true });
      expect(panel().querySelector('.clew-context-label')?.textContent).toBe('Waves');
      select(0);
      select(1);
      expect(panel().querySelector('.clew-context-label')?.textContent).toBe('Waves');
      expect(animate.mock.instances.filter((el) => (el as unknown as HTMLElement).closest('.clew-context-chip'))).toHaveLength(0);
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'animate', original);
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
      if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
      else Reflect.deleteProperty(window, 'matchMedia');
      note.contentEl.remove();
    }
  });

  it('uses the same stop lifecycle for demos while preserving the draft and native session', async () => {
    const { start, view, send, sessions, type, input, panel, store } = setup();
    await start();
    send('Original question'); await settle();
    sessions[0]!.events.push({ type: 'done', status: 'completed' }); sessions[0]!.events.close(); await settle();
    const id = view.chatId!;
    type('Unsent draft');
    const events = new AsyncQueue<AgentEvent>();
    let received: string | undefined;
    let signal: AbortSignal | undefined;
    const demo: AgentSession = {
      id: 'scripted-demo', skills: async () => [], setModel: async () => undefined, close: async () => undefined,
      async *send(text, abort) {
        received = text; signal = abort;
        const stop = () => { events.push({ type: 'done', status: 'interrupted' }); events.close(); };
        abort?.addEventListener('abort', stop, { once: true });
        try { yield* events; } finally { abort?.removeEventListener('abort', stop); }
      },
    };
    const running = view.playTurn('Scripted reply', demo, 'demo.md'); await settle();
    expect(received).toBe('Scripted reply');
    expect(input().value).toBe('Unsent draft');
    expect(panel().querySelector('[aria-label="Stop"]')).not.toBeNull();
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await running;
    expect(signal?.aborted).toBe(true);
    expect(panel().querySelector('[aria-label="Send"]')).not.toBeNull();
    expect(input().value).toBe('Unsent draft');
    expect((await store.load(id))?.sessionId).toBe(sessions[0]!.id);
    expect((await store.load(id))?.turns[1]?.status).toBe('interrupted');
  });
  it('cleans up a paste that finishes storing after its tab closes', async () => {
    const { start, view, input, vault, disk } = setup();
    await start();
    let finish!: () => void;
    let began!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const started = new Promise<void>((resolve) => { began = resolve; });
    vault.write = async (path: string, text: string) => { began(); await pending; disk.set(path, text); };
    const paste = new Event('paste', { cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'x'.repeat(2100), files: [] } });
    input().dispatchEvent(paste);
    await started;
    await view.closeChat(view.chatId!);
    finish(); await settle();
    expect([...disk.keys()].filter((path) => path.startsWith('attachments/'))).toEqual([]);
  });
  it('keeps independent drafts and attached pastes when switching', async () => {
    const { start, view, input, type, select, panel } = setup();
    await start();
    const tabBar = view.contentEl.querySelector('.clew-chat-tab-bar')!;
    const tabParent = tabBar.parentElement;
    expect(tabParent).toBe(view.contentEl.querySelector('.clew-chat-panels'));
    type('Draft one');
    const paste = new Event('paste', { cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'a'.repeat(2100), files: [] } });
    input().dispatchEvent(paste);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(panel().querySelector('.clew-attachment-chip')).not.toBeNull();
    await view.openChat({ fresh: true });
    expect(input().value).toBe('');
    expect(panel().querySelector('.clew-attachment-chip')).toBeNull();
    type('Draft two');
    select(0);
    expect(tabBar.parentElement).toBe(tabParent);
    expect(panel().contains(tabBar)).toBe(false);
    expect(input().value).toBe('Draft one');
    expect(panel().textContent).toContain('Pasted text');
    const first = tabBar.querySelector<HTMLButtonElement>('[role="tab"]')!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(input().value).toBe('Draft two');
  });

  it('streams two replies independently and marks a background completion unread', async () => {
    const { start, view, send, select, sessions, store, panel } = setup();
    await start();
    const first = view.chatId!;
    send('Question one'); await settle();
    await view.openChat({ fresh: true });
    const second = view.chatId!;
    send('Question two'); await settle();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.signal?.aborted).toBe(false);
    sessions[0]!.events.push({ type: 'text', delta: 'First reply' });
    sessions[0]!.events.push({ type: 'done', status: 'completed' }); sessions[0]!.events.close();
    sessions[1]!.events.push({ type: 'text', delta: 'Second reply' });
    await settle();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(panel().textContent).toContain('Second reply');
    expect(panel().textContent).not.toContain('First reply');
    expect(view.contentEl.querySelector('[role="tab"]')?.classList.contains('is-unread')).toBe(true);
    expect((await store.load(first))?.turns[0]?.message).toBe('Question one');
    select(0);
    expect(panel().textContent).toContain('First reply');
    expect(view.contentEl.querySelector('[role="tab"]')?.classList.contains('is-unread')).toBe(false);
    sessions[1]!.events.push({ type: 'done', status: 'completed' }); sessions[1]!.events.close(); await settle();
    expect((await store.load(second))?.turns[0]?.message).toBe('Question two');
  });

  it('does not autoplay highlights from a background chat', async () => {
    const { start, view, send, sessions, stage, store } = setup();
    await start();
    const first = view.chatId!;
    send('Explain'); await settle();
    await view.openChat({ fresh: true });
    sessions[0]!.events.push({ type: 'text', delta: '@Highlight("a long quote", "Look", "a.md")\n' });
    sessions[0]!.events.push({ type: 'done', status: 'completed' }); sessions[0]!.events.close(); await settle();
    expect(stage.show).not.toHaveBeenCalled();
    expect((await store.load(first))?.turns[0]?.parts).toContainEqual({ type: 'highlight', step: { path: 'a.md', quote: 'a long quote', comment: 'Look' } });
  });

  it('autoplays highlights from the selected chat', async () => {
    const { start, send, sessions, stage } = setup();
    await start();
    send('Explain'); await settle();
    sessions[0]!.events.push({ type: 'text', delta: '@Highlight("a long quote", "Look", "a.md")\n' });
    sessions[0]!.events.push({ type: 'done', status: 'completed' }); sessions[0]!.events.close(); await settle();
    expect(stage.show).toHaveBeenCalledTimes(1);
  });

  it('restores ordered tabs and the selected chat, accepting the previous single-chat state', async () => {
    const { start, view } = setup();
    await start(); const first = view.chatId!;
    await view.openChat({ fresh: true }); const second = view.chatId!;
    const state = view.getState();
    const restored = setup(); await restored.view.onOpen();
    await restored.view.setState(state, { history: false });
    expect(restored.view.getState()).toEqual({ chatId: second, chatIds: [first, second] });
    expect(restored.view.contentEl.querySelectorAll('.clew-chat-panel:not([hidden])')).toHaveLength(1);
    const legacy = setup(); await legacy.view.onOpen(); await legacy.view.setState({ chatId: first }, { history: false });
    expect(legacy.view.getState()).toEqual({ chatId: first, chatIds: [first] });
  });

  it('reuses an already-open chat instead of duplicating its session', async () => {
    const { start, view, sessions } = setup();
    await start(); const id = view.chatId!;
    await Promise.all([view.openChat({ chatId: id }), view.openChat({ chatId: id })]);
    expect(sessions).toHaveLength(1);
    expect(view.contentEl.querySelectorAll('[role="tab"]')).toHaveLength(1);
  });

  it('waits for a running tab to finish closing before reopening its saved session', async () => {
    const { start, view, sessions, send, store } = setup();
    await start(); const id = view.chatId!;
    send('Question'); await settle();
    await Promise.all([view.closeChat(id), view.openChat({ chatId: id })]);
    expect(view.chatId).toBe(id);
    expect(sessions.filter((session) => session.options.resume === sessions[0]!.id)).toHaveLength(1);
    expect((await store.load(id))?.turns[0]?.status).toBe('interrupted');
  });

  it('keeps each restored chat model independent of new-chat defaults', async () => {
    const { start, view, defaults, sessions, store } = setup();
    await start();
    const id = crypto.randomUUID();
    await store.save({ id, agent: 'claude', title: 'Saved', updatedAt: 1, turns: [], choice: { model: 'saved-model', effort: 'medium' } });
    await defaults.setChoice('claude', { model: 'default-model' });
    await view.openChat({ chatId: id }); await settle();
    expect(sessions.at(-1)!.options).toMatchObject({ model: 'saved-model', effort: 'medium' });
    await view.openChat({ fresh: true }); await settle();
    expect(sessions.at(-1)!.options.model).toBe('default-model');
  });

  it('carries selected chat text, preserves it across tabs and consumes it on send', async () => {
    const { start, view, panel, input, select, send, sessions, store } = setup();
    await start();
    send('Original message'); await settle();
    sessions[0]!.events.push({ type: 'text', delta: 'An explanation to quote.' });
    sessions[0]!.events.push({ type: 'done', status: 'completed' }); sessions[0]!.events.close(); await settle();
    const first = view.chatId!;
    const text = panel().querySelector('.clew-reply-text')!;
    const range = document.createRange(); range.selectNodeContents(text);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    expect(document.getSelection()!.toString()).toBe('An explanation to quote.');
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(panel().textContent).toContain('1 line selected');
    await view.openChat({ fresh: true });
    expect(panel().textContent).not.toContain('line selected');
    select(0);
    expect(panel().textContent).toContain('1 line selected');
    input().focus(); document.getSelection()!.removeAllRanges();
    // Reopen a session's event stream for its next turn, as a real CLI does.
    const next = new AsyncQueue<AgentEvent>();
    sessions[0]!.send = async function* (text, signal) { sessions[0]!.input.push(text); sessions[0]!.signal = signal; yield* next; };
    send('Explain that'); await settle();
    expect(sessions[0]!.input.at(-1)).toContain(`<selection source="chat" chatId="${first}">\nAn explanation to quote.\n</selection>`);
    expect(panel().querySelector('.clew-context-tray')!.textContent).not.toContain('selected');
    next.push({ type: 'done', status: 'completed' }); next.close(); await settle();
    expect((await store.load(first))?.turns[1]?.quote).toMatchObject({ source: 'chat', path: first, text: 'An explanation to quote.' });
  });
});
