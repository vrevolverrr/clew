import { Chip, type ChipExit } from '@/shared/view/Chip';

/** An image shows a small thumbnail from `src`; a file, which has none, shows an icon. */
interface AttachmentChip {
  /** Names the chip across updates, so a chip that stays is not redrawn. */
  key: string;
  name: string;
  src?: string;
  title?: string;
}

/**
 * The chips for what the next message carries besides text, each with a button to take it off. They join the
 * context chips in `tray`, after them, animate the same way, and only ever touch their own.
 */
export class AttachmentChips {
  private readonly chips = new Map<string, Chip>();

  constructor(
    private readonly tray: HTMLElement,
    private readonly onRemove: (key: string) => void,
  ) {}

  set(items: AttachmentChip[], exit: ChipExit = 'dropped'): void {
    const keys = new Set(items.map((item) => item.key));
    for (const [key, chip] of this.chips) {
      if (keys.has(key)) continue;
      chip.leave(exit);
      this.chips.delete(key);
    }
    for (const { key, name, src, title } of items) {
      let chip = this.chips.get(key);
      if (!chip) {
        chip = new Chip(this.tray, { label: `Remove ${name}`, onClick: () => this.onRemove(key) });
        chip.el.addClass('clew-attachment-chip');
        if (src) chip.el.addClass('clew-image-chip');
        this.chips.set(key, chip);
      }
      chip.set('file-text', name, title ?? name, src);
    }
  }
}
