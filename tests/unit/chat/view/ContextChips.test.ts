/**
 * @jest-environment jsdom
 */
import { ContextChips, type ContextChipsHost } from '@/chat/view/ContextChips';
import type { OpenDocumentState } from '@/context/NoteContext';

jest.mock('obsidian', () => ({ setIcon: jest.fn() }), { virtual: true });

const NOTE = { path: 'Physics/Waves.md', icon: 'file-text', label: 'Waves', excluded: false };

describe('ContextChips', () => {
  let host: jest.Mocked<ContextChipsHost>;
  let chips: ContextChips;

  const chipEls = () => [...document.querySelectorAll<HTMLElement>('.clew-context-chip')];
  const labels = () => chipEls().map((chip) => chip.querySelector('.clew-context-label')?.textContent);
  const show = (state: OpenDocumentState, exit?: 'dropped' | 'sent') => chips.set(state, exit);

  beforeEach(() => {
    document.body.replaceChildren();
    host = { toggleNote: jest.fn(), removeSelection: jest.fn() };
    chips = new ContextChips(document.body, host);
  });

  it('shows the note and the selection with a line count', () => {
    show({ note: NOTE, selection: { lines: 3 } });
    expect(labels()).toEqual(['Waves', '3 lines selected']);
    show({ note: NOTE, selection: { lines: 1 } });
    expect(labels()).toEqual(['Waves', '1 line selected']);
  });

  it('updates a chip in place so it does not arrive again', () => {
    show({ note: NOTE });
    const [before] = chipEls();
    show({ note: { ...NOTE, label: 'Optics', excluded: true } });
    expect(chipEls()).toEqual([before]);
    expect(labels()).toEqual(['Optics']);
    expect(before!.classList.contains('is-excluded')).toBe(true);
    expect(before!.getAttribute('aria-pressed')).toBe('false');
  });

  it('removes a chip when its subject goes away', () => {
    show({ note: NOTE, selection: { lines: 2 } });
    show({ note: NOTE });
    expect(labels()).toEqual(['Waves']);
    show({});
    expect(chipEls()).toEqual([]);
  });

  it('toggles the note on click, and on Enter or Space from the chip itself', () => {
    show({ note: NOTE });
    const [chip] = chipEls();
    chip!.click();
    chip!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    chip!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    chip!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(host.toggleNote).toHaveBeenCalledTimes(3);
  });

  it('removes the selection without toggling the note', () => {
    show({ note: NOTE, selection: { lines: 2 } });
    document.querySelector<HTMLElement>('.clew-context-remove')!.click();
    expect(host.removeSelection).toHaveBeenCalledTimes(1);
    expect(host.toggleNote).not.toHaveBeenCalled();
  });

  describe('with animation', () => {
    let finish: (() => void)[];
    let animate: jest.Mock;

    beforeEach(() => {
      finish = [];
      animate = jest.fn(() => ({ finished: new Promise<void>((resolve) => finish.push(resolve)) }));
      Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
      window.matchMedia = jest.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    });

    it('animates a chip in once, and not when it only changes', () => {
      show({ note: NOTE });
      expect(animate).toHaveBeenCalledTimes(1);
      show({ note: { ...NOTE, excluded: true } });
      expect(animate).toHaveBeenCalledTimes(1);
    });

    it('keeps a leaving chip, inert, until its animation ends', async () => {
      show({ note: NOTE, selection: { lines: 2 } });
      animate.mockClear();
      show({ note: NOTE }, 'sent');
      const leaving = document.querySelector<HTMLElement>('.clew-context-chip.is-leaving')!;
      expect(leaving.textContent).toContain('2 lines selected');
      expect(animate.mock.calls[0][0][1].transform).toBe('translateY(-8px)');
      finish[finish.length - 1]!();
      await Promise.resolve();
      await Promise.resolve();
      expect(leaving.isConnected).toBe(false);
    });

    it('shows a returning subject as a new chip while the old one leaves', () => {
      show({ note: NOTE });
      show({});
      show({ note: NOTE });
      expect(chipEls().filter((chip) => !chip.classList.contains('is-leaving'))).toHaveLength(1);
      expect(chipEls()).toHaveLength(2);
    });
  });
});
