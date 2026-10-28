import { setIcon } from '@/shared/view/icon';

import { canAnimate, createIconButton } from '@/shared/view/iconButtons';

/** How a chip leaves: a dropped one shrinks away, a sent one rises toward the message it went with. */
export type ChipExit = 'dropped' | 'sent';

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** One chip above the input. It lives as long as its subject, so only a chip that arrives or leaves animates. */
export class Chip {
  readonly el: HTMLElement;
  private readonly iconEl: HTMLElement;
  private readonly labelEl: HTMLElement;
  private look = '';
  private arrived = false;

  constructor(tray: HTMLElement, remove?: { label: string; onClick: () => void }) {
    this.el = tray.createDiv({ cls: 'clew-context-chip' });
    this.iconEl = this.el.createSpan({ cls: 'clew-context-icon' });
    this.labelEl = this.el.createSpan({ cls: 'clew-context-label' });
    if (remove) {
      const button = createIconButton(this.el, 'x', remove.label, 'clew-context-remove');
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        remove.onClick();
      });
    }
  }

  /** `thumb`, an image address, takes the icon's place. */
  set(icon: string, label: string, title: string, thumb?: string, animate = true): void {
    if (!animate && this.arrived) this.el.getAnimations?.({ subtree: true }).forEach((animation) => animation.finish());
    const look = thumb ?? icon;
    if (look !== this.look) {
      this.iconEl.empty();
      if (thumb) this.iconEl.createEl('img', { attr: { src: thumb, alt: '' } });
      else setIcon(this.iconEl, icon);
      this.look = look;
    }
    const changed = this.arrived && label !== this.labelEl.textContent;
    this.labelEl.setText(label);
    this.el.title = title;
    if (!this.arrived) {
      this.arrived = true;
      if (animate && canAnimate(this.el)) squeeze(this.el, 'in', 'scale(0.9)');
    } else if (animate && changed && canAnimate(this.labelEl)) {
      this.labelEl.animate([{ opacity: 0.3, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: EASE });
    }
  }

  leave(exit: ChipExit): void {
    this.el.addClass('is-leaving');
    this.el.setAttribute('aria-hidden', 'true');
    if (!canAnimate(this.el)) {
      this.el.remove();
      return;
    }
    const remove = (): void => this.el.remove();
    squeeze(this.el, 'out', exit === 'sent' ? 'translateY(-8px)' : 'scale(0.9)').finished.then(remove, remove);
  }
}

/** Grows a chip from nothing or folds it back to nothing. Its box and the gap beside it collapse together, so the chips next to it slide into place. */
function squeeze(chip: HTMLElement, direction: 'in' | 'out', transform: string): Animation {
  const style = getComputedStyle(chip);
  const gap = parseFloat(getComputedStyle(chip.parentElement!).columnGap) || 0;
  const open: Keyframe = {
    width: `${chip.offsetWidth}px`,
    height: `${chip.offsetHeight}px`,
    paddingTop: style.paddingTop,
    paddingRight: style.paddingRight,
    paddingBottom: style.paddingBottom,
    paddingLeft: style.paddingLeft,
    marginRight: '0px',
    opacity: 1,
    transform: 'none',
  };
  const shut: Keyframe = { width: '0px', height: '0px', paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px', marginRight: `${-gap}px`, opacity: 0, transform };
  return chip.animate(direction === 'in' ? [shut, open] : [open, shut], {
    duration: direction === 'in' ? 200 : 160,
    easing: direction === 'in' ? EASE : 'ease-in',
    fill: direction === 'out' ? 'forwards' : 'none',
  });
}
