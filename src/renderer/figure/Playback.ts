import { formatFigure } from '@/renderer/figure/formatFigure';
import { svg } from '@/renderer/figure/dom';

const PLAY = 'M5 3.5v9l7.5-4.5z';
const PAUSE = 'M4.5 3.5h2v9h-2zM9.5 3.5h2v9h-2z';

/** DOM and timer shared by Player and figures with local snapshot state. */
export class Playback {
  readonly el = createDiv();
  private readonly play: HTMLButtonElement;
  private readonly playIcon: SVGElement;
  private readonly back: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly range: HTMLInputElement;
  private readonly count: HTMLOutputElement;
  private timer: number | null = null;
  private max = 0;
  private current = 0;
  private step = 1;
  private ms = 800;

  /** `forward` is true when Next or the timer advanced one step, the only moves a figure animates. */
  constructor(private readonly change: (value: number, forward: boolean) => void) {
    this.el.className = 'clew-player';
    const button = (label: string, shape: string, fill = 'currentColor') => {
      const b = this.el.appendChild(createEl('button'));
      b.type = 'button';
      b.className = 'clew-player-button';
      b.title = label;
      b.setAttribute('aria-label', label);
      const icon = svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }, b);
      return { b, icon: svg('path', { d: shape, fill }, icon) };
    };
    ({ b: this.back } = button('Back', 'M10 3.5L5.5 8l4.5 4.5', 'none'));
    ({ b: this.play, icon: this.playIcon } = button('Play', PLAY));
    ({ b: this.next } = button('Next', 'M6 3.5L10.5 8 6 12.5', 'none'));
    this.range = this.el.appendChild(createEl('input'));
    this.range.type = 'range';
    this.range.min = '0';
    this.range.setAttribute('aria-label', 'Position');
    this.count = this.el.appendChild(createEl('output'));
    this.count.className = 'clew-player-count';
    this.back.addEventListener('click', () => { this.stop(); this.move(this.current - this.step, false); });
    this.next.addEventListener('click', () => { this.stop(); this.move(this.current + this.step, true); });
    this.range.addEventListener('input', () => { this.stop(); this.move(Number(this.range.value), false); });
    this.play.addEventListener('click', () => this.toggle());
    // A button already takes Space; on the scrubber it would otherwise do nothing.
    this.range.addEventListener('keydown', event => {
      if (event.key !== ' ') return;
      event.preventDefault();
      this.toggle();
    });
  }

  /** Non-finite or non-positive `ms` and `step` fall back to 800 and 1. `offset` shifts only the displayed count. */
  update(max: number, current: number, { ms = NaN, step = NaN, offset = 0 } = {}): void {
    this.max = Math.max(0, Number.isFinite(max) ? max : 0);
    this.current = current;
    this.ms = Number.isFinite(ms) && ms > 0 ? ms : 800;
    this.step = Number.isFinite(step) && step > 0 ? step : 1;
    this.range.max = String(this.max);
    this.range.step = String(this.step);
    if (Number(this.range.value) !== current) this.range.value = String(current);
    const total = formatFigure(this.max + offset);
    this.count.textContent = `${formatFigure(current + offset)} / ${total}`;
    // Reserve the widest count so the track keeps its length while stepping.
    this.count.style.minWidth = `${2 * total.length + 3}ch`;
    this.range.style.setProperty('--clew-progress', `${this.max ? (current / this.max) * 100 : 0}%`);
    this.play.disabled = this.range.disabled = this.max === 0;
    this.back.disabled = current <= 0;
    this.next.disabled = current >= this.max;
    if (this.max === 0) this.stop();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.setPlaying(false);
  }

  private setPlaying(on: boolean): void {
    const label = on ? 'Pause' : 'Play';
    this.play.title = label;
    this.play.setAttribute('aria-label', label);
    this.playIcon.setAttribute('d', on ? PAUSE : PLAY);
  }

  private move(to: number, forward: boolean): void {
    this.current = Math.min(this.max, Math.max(0, to));
    this.change(this.current, forward);
  }

  private toggle(): void {
    if (this.timer !== null) return this.stop();
    if (this.max === 0) return;
    if (this.current >= this.max) this.move(0, false);
    this.setPlaying(true);
    this.timer = window.setInterval(() => {
      this.move(this.current + this.step, true);
      if (this.current >= this.max) this.stop();
    }, this.ms);
  }
}
