/** @jest-environment jsdom */
import { ChatTabs, type ChatTab } from '@/chat/view/ChatTabs';

jest.mock('obsidian', () => ({ setIcon: jest.fn() }), { virtual: true });

let resize: () => void;
const tab = (id: string, fields: Partial<ChatTab> = {}): ChatTab => ({ id, title: `Topic ${id}`, agent: 'claude', running: false, unread: false, failed: false, ...fields });

beforeEach(() => {
  document.body.empty();
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) { resize = callback; }
    observe(): void {} disconnect(): void {}
  } as unknown as typeof ResizeObserver;
});

it('updates status and selection without replacing focused buttons', () => {
  const host = { create: jest.fn(), select: jest.fn(), close: jest.fn() };
  const tabs = new ChatTabs(document.body.createDiv(), host);
  tabs.set([tab('a'), tab('b')], 'a');
  const first = tabs.el.querySelector<HTMLButtonElement>('button')!;
  first.focus();
  tabs.set([tab('a', { running: true }), tab('b', { unread: true })], 'a');
  expect(document.activeElement).toBe(first);
  expect(first.getAttribute('aria-label')).toBe('1: Topic a, Generating');
  expect(first.getAttribute('aria-selected')).toBe('true');
  expect(tabs.el.querySelectorAll('button')[1]!.getAttribute('aria-label')).toBe('2: Topic b, Unread reply');
  expect(first.querySelector('.clew-chat-tab-title')!.textContent).toBe('Topic a');
  tabs.destroy();
});

it('fits the composer strip, keeps the selected tab visible and restores tabs as it grows', () => {
  const header = document.body.createDiv();
  let width = 92;
  Object.defineProperty(header, 'clientWidth', { get: () => width });
  const tabs = new ChatTabs(header, { create: jest.fn(), select: jest.fn(), close: jest.fn() });
  tabs.set(['a', 'b', 'c', 'd'].map((id) => tab(id)), 'd');
  const visible = () => [...tabs.el.querySelectorAll<HTMLButtonElement>('[role="tab"]')].filter((button) => !button.hidden).map((button) => button.textContent);
  expect(visible()).toEqual(['1Topic a', '4Topic d']);
  const create = tabs.el.querySelector<HTMLButtonElement>('[aria-label="New tab"]')!;
  expect(create.hidden).toBe(false);
  expect(tabs.el.lastElementChild).toBe(create);
  width = 91; resize();
  expect(visible()).toEqual(['4Topic d']);
  expect(create.hidden).toBe(false);
  width = 200; resize();
  expect(visible()).toEqual(['1Topic a', '2Topic b', '3Topic c', '4Topic d']);
  tabs.destroy();
});

it('supports arrow navigation and closing without changing chats on hover', () => {
  const host = { create: jest.fn(), select: jest.fn(), close: jest.fn() };
  const tabs = new ChatTabs(document.body.createDiv(), host);
  tabs.set([tab('a'), tab('b')], 'a');
  const first = tabs.el.querySelector<HTMLButtonElement>('button')!;
  first.dispatchEvent(new Event('pointerenter'));
  expect(host.select).not.toHaveBeenCalled();
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(host.select).toHaveBeenCalledWith('b');
  expect(document.activeElement).toBe(tabs.el.querySelectorAll('button')[1]);
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  expect(host.close).toHaveBeenCalledWith('a');
  host.close.mockClear();
  const rightClick = new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true });
  first.dispatchEvent(rightClick);
  expect(rightClick.defaultPrevented).toBe(true);
  expect(host.close).toHaveBeenCalledTimes(1);
  expect(host.close).toHaveBeenCalledWith('a');
  tabs.destroy();
});

it('keeps replacement order for numbering, overflow and keyboard navigation, with a trailing new-tab button', () => {
  const host = { create: jest.fn(), select: jest.fn(), close: jest.fn() };
  const tabs = new ChatTabs(document.body.createDiv(), host);
  tabs.set([tab('a'), tab('b'), tab('c')], 'b');
  tabs.set([tab('a'), tab('d'), tab('c')], 'd');
  const buttons = [...tabs.el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['1: Topic a', '2: Topic d', '3: Topic c']);
  buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(host.select).toHaveBeenLastCalledWith('c');
  const create = tabs.el.querySelector<HTMLButtonElement>('[aria-label="New tab"]')!;
  create.click();
  expect(host.create).toHaveBeenCalledTimes(1);
  expect(create.closest('[role="tablist"]')).toBeNull();
  tabs.destroy();
});

describe('tab motion', () => {
  let originalAnimate: PropertyDescriptor | undefined;
  let originalMatchMedia: PropertyDescriptor | undefined;
  let reduced: boolean;
  let played: Array<{ frames: Keyframe[]; finish: () => void; cancel: jest.Mock }>;

  beforeEach(() => {
    originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    reduced = false;
    played = [];
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: reduced }) });
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: (frames: Keyframe[]) => {
      let finish!: () => void;
      let reject!: (error: Error) => void;
      const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
      const cancel = jest.fn(() => reject(new Error('Animation cancelled')));
      played.push({ frames, finish, cancel });
      return { finished, cancel };
    } });
  });

  afterEach(() => {
    if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    else Reflect.deleteProperty(window, 'matchMedia');
  });

  it('expands a new tab and its gap once, without replaying on status changes', async () => {
    const tabs = new ChatTabs(document.body.createDiv(), { create: jest.fn(), select: jest.fn(), close: jest.fn() });
    tabs.set([tab('a')], 'a');
    expect(played).toHaveLength(0);
    tabs.set([tab('a'), tab('b')], 'b');
    expect(played).toHaveLength(1);
    expect(played[0]!.frames[0]).toMatchObject({ width: '0px', marginInlineEnd: '0px', opacity: 0 });
    expect(played[0]!.frames[1]).toMatchObject({ width: '28px', marginInlineEnd: '4px', opacity: 1 });
    tabs.set([tab('a'), tab('b', { running: true })], 'b');
    expect(played).toHaveLength(1);
    played[0]!.finish();
    await Promise.resolve();
    expect(tabs.el.querySelector('.is-entering')).toBeNull();
    tabs.destroy();
  });

  it('keeps a removed tab in its slot while it shrinks, with survivors immediately numbered and focus restored', async () => {
    const tabs = new ChatTabs(document.body.createDiv(), { create: jest.fn(), select: jest.fn(), close: jest.fn() });
    tabs.set([tab('a'), tab('b'), tab('c')], 'b');
    const middle = tabs.el.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!;
    middle.focus();
    tabs.set([tab('a'), tab('c')], 'c');
    expect(middle.isConnected).toBe(true);
    expect(middle.disabled).toBe(true);
    expect(middle.inert).toBe(true);
    expect(middle.getAttribute('aria-hidden')).toBe('true');
    expect([...middle.parentElement!.children].indexOf(middle)).toBe(1);
    const survivors = tabs.el.querySelectorAll('[role="tab"]');
    expect(survivors[1]!.getAttribute('aria-label')).toBe('2: Topic c');
    expect(document.activeElement).toBe(survivors[1]);
    expect(played[0]!.frames[1]).toMatchObject({ width: '0px', marginInlineEnd: '0px', opacity: 0 });
    tabs.set([tab('a'), tab('c', { unread: true })], 'c');
    expect(played).toHaveLength(1);
    played[0]!.finish();
    await Promise.resolve();
    expect(middle.isConnected).toBe(false);
    tabs.destroy();
  });

  it('handles removal during expansion and cancels unfinished motion on destroy', async () => {
    const tabs = new ChatTabs(document.body.createDiv(), { create: jest.fn(), select: jest.fn(), close: jest.fn() });
    tabs.set([tab('a')], 'a');
    tabs.set([tab('a'), tab('b')], 'b');
    tabs.set([tab('a')], 'a');
    expect(played[0]!.cancel).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(tabs.el.querySelector('.is-leaving')).not.toBeNull();
    tabs.destroy();
    await Promise.resolve();
    expect(played[1]!.cancel).toHaveBeenCalledTimes(1);
    expect(tabs.el.querySelector('.is-leaving, .is-entering')).toBeNull();
  });

  it('adds and removes immediately under reduced motion', () => {
    reduced = true;
    const tabs = new ChatTabs(document.body.createDiv(), { create: jest.fn(), select: jest.fn(), close: jest.fn() });
    tabs.set([tab('a')], 'a');
    tabs.set([tab('a'), tab('b')], 'b');
    tabs.set([tab('a')], 'a');
    expect(played).toHaveLength(0);
    expect(tabs.el.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(tabs.el.querySelector('.is-leaving')).toBeNull();
    tabs.destroy();
  });
});
