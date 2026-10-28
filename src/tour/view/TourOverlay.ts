import { type Anchor, placeCard, type Size } from '@/tour/placeCard';

const GLIDE_MS = 450;
const SVG = 'http://www.w3.org/2000/svg';

/** Plays the CSS animation `cls` carries from its start again. */
function restart(el: HTMLElement, cls: string): void {
  el.removeClass(cls);
  void el.offsetWidth;
  el.addClass(cls);
}

/**
 * A cursor and a comment card drawn over the page, following an anchor the caller reports each frame, so the pair stays
 * on its text while the page scrolls. It hides while the point is outside the pane and while nothing is pointed at.
 */
export class TourOverlay {
  private readonly layer: HTMLElement;
  private readonly cursor: HTMLElement;
  private readonly card: HTMLElement;
  private readonly text: HTMLElement;
  private readonly bar: HTMLElement;
  private target: (() => Anchor | null) | null = null;
  private pane: HTMLElement | null = null;
  private size: Size = { width: 0, height: 0 };
  private frame = 0;
  private glide = 0;

  /** `hold` runs when the pointer or focus enters the card (true) and leaves it (false): the step stays while it is there. */
  constructor(parent: HTMLElement, hold: (held: boolean) => void) {
    this.layer = parent.createDiv({ cls: 'clew-tour' });
    this.cursor = this.layer.createDiv({ cls: 'clew-tour-cursor' });
    const arrow = document.createElementNS(SVG, 'svg');
    arrow.setAttribute('viewBox', '0 0 22 26');
    arrow.setAttribute('width', '26');
    arrow.setAttribute('height', '31');
    const shape = document.createElementNS(SVG, 'path');
    shape.setAttribute('d', 'M2.18 4.59 Q2 2 4.02 3.63 L17.98 14.87 Q20 16.5 17.44 16.97 L10.57 18.21 Q9 18.5 7.87 19.63 L5.34 22.16 Q3.5 24 3.32 21.41 Z');
    arrow.append(shape);
    this.cursor.append(arrow);
    // A screen reader reads each comment as it appears.
    this.card = this.layer.createDiv({ cls: 'clew-tour-card', attr: { role: 'status', 'aria-live': 'polite' } });
    this.text = this.card.createDiv({ cls: 'clew-tour-text' });
    this.bar = this.card.createDiv({ cls: 'clew-tour-bar' });
    this.card.addEventListener('mouseenter', () => hold(true));
    this.card.addEventListener('mouseleave', () => hold(false));
    this.card.addEventListener('focusin', () => hold(true));
    this.card.addEventListener('focusout', () => hold(false));
  }

  /** Points at the anchor `target` reports inside `pane`; the cursor glides there from where it was. */
  show(target: () => Anchor | null, pane: HTMLElement, comment?: string): void {
    this.target = target;
    this.pane = pane;
    this.text.setText(comment ?? '');
    this.card.toggleClass('is-empty', !comment);
    this.layer.addClass('is-active');
    restart(this.card, 'is-in');
    // The card's size changes only with its text, so the frame loop need not read it.
    this.size = { width: this.card.offsetWidth, height: this.card.offsetHeight };
    this.layer.addClass('is-gliding');
    window.clearTimeout(this.glide);
    this.glide = window.setTimeout(() => this.layer.removeClass('is-gliding'), GLIDE_MS);
    if (!this.frame) this.frame = window.requestAnimationFrame(this.tick);
  }

  /** Drains the line on the card's bottom edge over `ms`; it freezes while the pointer is on the card. */
  setTiming(ms: number): void {
    this.bar.style.setProperty('--clew-tour-ms', `${ms}ms`);
    restart(this.bar, 'is-timing');
  }

  hide(): void {
    window.cancelAnimationFrame(this.frame);
    window.clearTimeout(this.glide);
    this.frame = 0;
    this.target = null;
    this.layer.removeClass('is-active');
  }

  destroy(): void {
    this.hide();
    this.layer.remove();
  }

  private readonly tick = (): void => {
    this.frame = window.requestAnimationFrame(this.tick);
    const point = this.target?.() ?? null;
    const bounds = this.pane?.getBoundingClientRect();
    const visible = !!point && !!bounds && point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
    this.layer.toggleClass('is-hidden', !visible);
    if (!visible) return;
    this.cursor.style.transform = `translate(${point.x}px, ${point.y}px)`;
    const at = placeCard(point, this.size, bounds);
    this.card.style.transform = `translate(${at.x}px, ${at.y}px)`;
  };
}
