/**
 * @jest-environment jsdom
 */
import { dismissOnOutside, menuLabelId, removeMenu } from '@/chat/view/menuDismiss';

function setup() {
  const anchor = document.body.appendChild(document.createElement('button'));
  const menu = document.body.appendChild(document.createElement('div'));
  const inside = menu.appendChild(document.createElement('button'));
  const close = jest.fn();
  const stop = dismissOnOutside(anchor, menu, close);
  return { anchor, menu, inside, close, stop };
}

const press = (target: Element) => target.dispatchEvent(new Event('pointerdown', { bubbles: true }));

beforeEach(() => document.body.replaceChildren());

describe('dismissOnOutside', () => {
  it('closes on a press outside, but not on the menu or its anchor', () => {
    const { anchor, inside, close } = setup();

    press(inside);
    press(anchor);
    expect(close).not.toHaveBeenCalled();

    press(document.body);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and returns focus to the anchor', () => {
    const { anchor, close } = setup();
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });

    document.dispatchEvent(event);

    expect(close).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(anchor);
  });

  it('ignores other keys', () => {
    const { close } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(close).not.toHaveBeenCalled();
  });

  it('stops listening once told to', () => {
    const { close, stop } = setup();
    stop();

    press(document.body);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(close).not.toHaveBeenCalled();
  });
});

describe('menuLabelId', () => {
  it('gives each anchor one id, kept across calls', () => {
    const a = document.createElement('button');
    const b = document.createElement('button');

    expect(menuLabelId(a)).toBe(menuLabelId(a));
    expect(menuLabelId(a)).not.toBe(menuLabelId(b));
  });
});

describe('removeMenu', () => {
  it('marks the menu as closing, then removes it', () => {
    jest.useFakeTimers();
    const menu = document.body.appendChild(document.createElement('div'));

    removeMenu(menu);
    expect(menu.classList.contains('is-closing')).toBe(true);
    expect(menu.isConnected).toBe(true);

    jest.advanceTimersByTime(200);
    expect(menu.isConnected).toBe(false);
    jest.useRealTimers();
  });
});
