/**
 * @jest-environment jsdom
 */
import { AttachmentChips } from '@/attachments/view/AttachmentChips';

jest.mock('obsidian', () => ({ setIcon: jest.fn() }), { virtual: true });

const IMAGE = { key: 'a.png', name: 'a.png', src: 'app://a' };
const FILE = { key: '/Users/me/week1.pdf', name: 'week1.pdf', title: '/Users/me/week1.pdf' };

describe('AttachmentChips', () => {
  let tray: HTMLElement;
  let onRemove: jest.Mock;
  let chips: AttachmentChips;

  const chipEls = () => [...tray.querySelectorAll<HTMLElement>('.clew-attachment-chip')];
  const labels = () => [...tray.querySelectorAll('.clew-context-label')].map((label) => label.textContent);

  beforeEach(() => {
    document.body.replaceChildren();
    tray = document.body.appendChild(document.createElement('div'));
    tray.createDiv({ cls: 'clew-context-chip' }).createSpan({ cls: 'clew-context-label', text: 'Waves' });
    onRemove = jest.fn();
    chips = new AttachmentChips(tray, onRemove);
  });

  it('adds a thumbnail chip for an image and an icon chip for a file, beside the chips already in the tray', () => {
    chips.set([IMAGE, FILE]);
    expect(labels()).toEqual(['Waves', 'a.png', 'week1.pdf']);
    expect(tray.querySelector('.clew-image-chip img')?.getAttribute('src')).toBe('app://a');
    expect(chipEls().map((chip) => chip.classList.contains('clew-image-chip'))).toEqual([true, false]);
    expect(chipEls()[1]!.title).toBe('/Users/me/week1.pdf');
  });

  it('keeps the chip of an item that stays, and leaves the chips that are not its own', () => {
    chips.set([IMAGE]);
    const [first] = chipEls();
    chips.set([IMAGE, FILE]);
    expect(chipEls()[0]).toBe(first);
    chips.set([FILE]);
    expect(labels()).toEqual(['Waves', 'week1.pdf']);
    chips.set([]);
    expect(labels()).toEqual(['Waves']);
  });

  it('reports the key of the chip whose remove button is clicked', () => {
    chips.set([IMAGE, FILE]);
    const buttons = tray.querySelectorAll<HTMLElement>('.clew-attachment-chip .clew-context-remove');
    buttons[1]!.click();
    buttons[0]!.click();
    expect(onRemove.mock.calls).toEqual([['/Users/me/week1.pdf'], ['a.png']]);
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

    it('animates a chip in once, and not when the list is set again', () => {
      chips.set([IMAGE]);
      expect(animate).toHaveBeenCalledTimes(1);
      chips.set([IMAGE]);
      expect(animate).toHaveBeenCalledTimes(1);
      chips.set([IMAGE, FILE]);
      expect(animate).toHaveBeenCalledTimes(2);
      expect(animate.mock.contexts[1]).toBe(chipEls()[1]);
    });

    it('keeps a leaving chip, inert, until its animation ends, and lifts it away when sent', async () => {
      chips.set([IMAGE]);
      animate.mockClear();
      chips.set([], 'sent');
      const leaving = chipEls()[0]!;
      expect(leaving.classList.contains('is-leaving')).toBe(true);
      expect(animate.mock.calls[0][0][1].transform).toBe('translateY(-8px)');
      finish[finish.length - 1]!();
      await Promise.resolve();
      await Promise.resolve();
      expect(leaving.isConnected).toBe(false);
    });

    it('shrinks a removed chip away by default', () => {
      chips.set([IMAGE]);
      animate.mockClear();
      chips.set([]);
      expect(animate.mock.calls[0][0][1].transform).toBe('scale(0.9)');
    });
  });
});
