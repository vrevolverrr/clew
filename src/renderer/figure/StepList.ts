import type { Step } from '@/renderer/figure/FigureData';

export type StepText = Pick<Step, 'caption' | 'heading'>;
type Write = (el: HTMLElement, text: string) => void;

/** Writes a step's heading, when it has one, over its caption. */
export function writeStep(el: HTMLElement, step: StepText, write: Write): void {
  if (step.heading) write(el.createDiv({ cls: 'clew-step-heading' }), step.heading);
  write(el.createDiv({ cls: 'clew-step-caption' }), step.caption);
}

/** Every step as a numbered vertical list: the current one marked and announced, any one picked by a click. */
export class StepList {
  readonly el = createDiv();
  private readonly items: HTMLElement[];
  private readonly live = createDiv();

  constructor(steps: readonly StepText[], write: Write, pick: (index: number) => void) {
    this.el.className = 'clew-steps';
    // Divs, not an <ol>: Obsidian's list rules indent and space a list in rendered Markdown.
    const list = this.el.createDiv({ attr: { role: 'list' } });
    this.items = steps.map((step, index) => {
      const item = list.createDiv({ cls: 'clew-step', attr: { role: 'listitem' } });
      const button = item.createEl('button', { cls: 'clew-step-button' });
      button.type = 'button';
      button.createSpan({ cls: 'clew-step-dot', text: String(index + 1) });
      writeStep(button.createDiv({ cls: 'clew-step-text' }), step, write);
      button.addEventListener('click', () => pick(index));
      return item;
    });
    this.live.className = 'clew-steps-live';
    this.live.setAttribute('aria-live', 'polite');
    this.el.append(this.live);
  }

  show(index: number): void {
    this.items.forEach((item, k) => {
      item.classList.toggle('is-done', k < index);
      item.classList.toggle('is-current', k === index);
      if (k === index) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    this.live.textContent = this.items[index]?.querySelector('.clew-step-text')?.textContent ?? '';
  }
}
