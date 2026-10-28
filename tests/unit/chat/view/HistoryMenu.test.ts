/**
 * @jest-environment jsdom
 */
import type { ChatSummary } from '@/chat/ChatRecord';
import type { HistoryMenuHost } from '@/chat/view/HistoryMenu';
import { HistoryMenu } from '@/chat/view/HistoryMenu';

jest.mock('@/chat/view/agentIcons', () => ({ appendAgentIcon: jest.fn() }));
jest.mock('obsidian', () => ({ setIcon: jest.fn() }), { virtual: true });

function chat(id: string, title: string): ChatSummary {
  return { id, agent: 'claude', title, updatedAt: Date.now(), text: '' };
}

function setup(chats: ChatSummary[], current?: string, tabs?: HistoryMenuHost['tabs']) {
  const host: HistoryMenuHost = {
    chats: jest.fn(async () => chats),
    current: () => current,
    open: jest.fn(),
    showAll: jest.fn(),
    tabs,
  };
  const anchor = document.body.appendChild(document.createElement('button'));
  const menu = new HistoryMenu(anchor, host);
  const rows = () => [...document.querySelectorAll<HTMLElement>('.clew-history-row')];
  return { host, anchor, menu, rows };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.replaceChildren();
  jest.useRealTimers();
});

describe('HistoryMenu', () => {
  it('focuses the first loaded row from the keyboard and preserves focus on refresh', async () => {
    const { anchor, menu, rows } = setup([chat('a', 'First'), chat('b', 'Second')]);
    anchor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await settle();
    expect(document.activeElement).toBe(rows()[0]);
    rows()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows()[1]);
    menu.refresh(); await settle();
    expect(document.activeElement).toBe(rows()[1]);
  });
  it('pins numbered open chats in tab order, including unsaved chats, without recent duplicates', async () => {
    const tabs: NonNullable<HistoryMenuHost['tabs']> = () => [
      { ...chat('b', 'Second'), running: true, unread: false, failed: false },
      { ...chat('draft', ''), running: false, unread: false, failed: false },
    ];
    const { anchor, rows } = setup([chat('a', 'First'), chat('b', 'Second')], 'b', tabs);
    anchor.dispatchEvent(new Event('pointerenter')); await settle();
    expect(rows().map((row) => row.querySelector('.clew-history-title')?.textContent)).toEqual(['Second', 'New chat', 'First']);
    expect(rows().map((row) => row.querySelector('.clew-history-number')?.textContent)).toEqual(['1', '2', undefined]);
    expect(rows()[0]!.textContent).toContain('Generating');
    expect([...document.querySelectorAll('.clew-history-group')].map((el) => el.textContent)).toEqual(['Open chats', 'Recent chats']);
  });

  it('refreshes pinned titles and activity while the menu stays open', async () => {
    let running = true;
    const { anchor, menu, rows } = setup([], 'a', () => [{ ...chat('a', running ? '' : 'Finished'), running, unread: !running, failed: false }]);
    anchor.dispatchEvent(new Event('pointerenter')); await settle();
    running = false; menu.refresh(); await settle();
    expect(rows()[0]!.textContent).toContain('Finished');
    expect(rows()[0]!.textContent).toContain('Unread reply');
    expect(anchor.getAttribute('aria-expanded')).toBe('true');
  });
  it('opens when the pointer enters the button and lists the recent chats', async () => {
    const { anchor, rows } = setup([chat('a', 'First'), chat('b', 'Second')]);
    anchor.dispatchEvent(new Event('pointerenter'));
    await settle();
    expect(rows().map((row) => row.querySelector('.clew-history-title')?.textContent)).toEqual(['First', 'Second']);
    expect(anchor.getAttribute('aria-expanded')).toBe('true');
  });

  it('lists only the ten newest chats', async () => {
    const { anchor, rows } = setup(Array.from({ length: 14 }, (_, i) => chat(`c${i}`, `Chat ${i}`)));
    anchor.dispatchEvent(new Event('pointerenter'));
    await settle();
    expect(rows()).toHaveLength(10);
  });

  it('marks the chat in this tab', async () => {
    const { anchor, rows } = setup([chat('a', 'First'), chat('b', 'Second')], 'b');
    anchor.dispatchEvent(new Event('pointerenter'));
    await settle();
    expect(rows().map((row) => row.getAttribute('aria-current'))).toEqual([null, 'true']);
  });

  it('opens the picked chat and closes', async () => {
    const { host, anchor, rows } = setup([chat('a', 'First')]);
    anchor.dispatchEvent(new Event('pointerenter'));
    await settle();
    rows()[0]!.click();
    expect(host.open).toHaveBeenCalledWith('a');
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
  });

  it('hands over to the searchable list from the last row', async () => {
    const { host, anchor } = setup([chat('a', 'First')]);
    anchor.dispatchEvent(new Event('pointerenter'));
    await settle();
    document.querySelector<HTMLElement>('.clew-history-all')!.click();
    expect(host.showAll).toHaveBeenCalled();
  });

  it('says so when there are no saved chats', async () => {
    const { anchor } = setup([]);
    anchor.dispatchEvent(new Event('pointerenter'));
    await settle();
    expect(document.querySelector('.clew-history-empty')?.textContent).toBe('No saved chats yet.');
    expect(document.querySelector('.clew-history-all')).toBeNull();
  });

  it('stays open while the pointer moves from the button onto the menu', async () => {
    jest.useFakeTimers();
    const { anchor, menu } = setup([chat('a', 'First')]);
    anchor.dispatchEvent(new Event('pointerenter'));
    anchor.dispatchEvent(new Event('pointerleave'));
    document.querySelector('.clew-history-menu')!.dispatchEvent(new Event('pointerenter'));
    jest.advanceTimersByTime(500);
    expect(anchor.getAttribute('aria-expanded')).toBe('true');
    menu.close();
  });

  it('closes shortly after the pointer leaves', () => {
    jest.useFakeTimers();
    const { anchor } = setup([chat('a', 'First')]);
    anchor.dispatchEvent(new Event('pointerenter'));
    anchor.dispatchEvent(new Event('pointerleave'));
    jest.advanceTimersByTime(300);
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape', () => {
    const { anchor } = setup([chat('a', 'First')]);
    anchor.dispatchEvent(new Event('pointerenter'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not draw a list that arrives after the menu closed', async () => {
    const { anchor, menu } = setup([chat('a', 'First')]);
    anchor.dispatchEvent(new Event('pointerenter'));
    menu.close();
    await settle();
    expect(document.querySelectorAll('.clew-history-row')).toHaveLength(0);
  });
});
