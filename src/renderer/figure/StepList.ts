import type { Step } from '@/renderer/figure/FigureData';

type StepText = Pick<Step, 'caption' | 'heading'>;
type Write = (el: HTMLElement, text: string) => void;

/**
 * Every step as a numbered vertical list: the current one marked and announced, any one picked by a click. `single` shows
 * only the current step, as a caption; the others stay in its grid cell, so the tallest keeps its height.
 */
export class StepList {
  readonly el = createDiv();
  private readonly items: HTMLElement[];
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly live = createDiv();

  constructor(steps: readonly StepText[], write: Write, pick: (index: number) => void) {
    this.el.className = 'clew-steps';
    // Divs, not an <ol>: Obsidian's list rules indent and space a list in rendered Markdown.
    const list = this.el.createDiv({ cls: 'clew-steps-list', attr: { role: 'list' } });
    this.items = steps.map((step, index) => {
      const item = list.createDiv({ cls: 'clew-step', attr: { role: 'listitem' } });
      const button = item.createEl('button', { cls: 'clew-step-button' });
      button.type = 'button';
      button.createSpan({ cls: 'clew-step-dot', text: String(index + 1) });
      const text = button.createDiv({ cls: 'clew-step-text' });
      if (step.heading) write(text.createDiv({ cls: 'clew-step-heading' }), step.heading);
      write(text.createDiv({ cls: 'clew-step-caption' }), step.caption);
      button.addEventListener('click', () => pick(index));
      this.buttons.push(button);
      return item;
    });
    this.live.className = 'clew-visually-hidden';
    this.live.setAttribute('aria-live', 'polite');
    this.el.append(this.live);
  }

  set single(on: boolean) {
    this.el.classList.toggle('is-single', on);
    // A caption is not a control: Tab skips it.
    for (const button of this.buttons) button.tabIndex = on ? -1 : 0;
  }

  show(index: number): void {
    this.items.forEach((item, k) => {
      item.classList.toggle('is-done', k < index);
      item.classList.toggle('is-current', k === index);
      if (k === index) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    const parts = this.items[index]?.querySelector('.clew-step-text')?.children ?? [];
    this.live.textContent = Array.from(parts, (part) => part.textContent).join(': ');
  }
}
