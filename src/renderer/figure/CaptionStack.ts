import { type StepText, writeNumbered, writeStep } from '@/renderer/figure/StepList';

/** The current caption over an invisible stack of every caption, so wrapping and resizing keep the tallest one's height. */
export class CaptionStack {
  readonly el = createDiv();
  private readonly live = createDiv();
  private readonly sizes = createDiv();
  private steps: readonly StepText[] = [];
  private shown = -1;

  constructor(private readonly render: (el: HTMLElement, text: string) => void) {
    this.el.className = 'clew-captions';
    this.live.className = 'clew-caption';
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('aria-atomic', 'true');
    this.sizes.className = 'clew-caption-sizes';
    this.sizes.setAttribute('aria-hidden', 'true');
    this.el.append(this.live, this.sizes);
  }

  /** Every step the block may show. Empty ones take no space; with none, the block hides. */
  set(steps: readonly StepText[]): void {
    this.steps = steps;
    this.shown = -1;
    this.sizes.replaceChildren(...steps.flatMap((step, index) => {
      if (!hasText(step)) return [];
      const size = createDiv();
      size.className = 'clew-caption';
      this.write(size, step, index);
      return [size];
    }));
    this.el.hidden = !steps.some(hasText);
  }

  show(index: number): void {
    if (index === this.shown) return;
    this.shown = index;
    const step = this.steps[index];
    this.live.replaceChildren();
    if (step && hasText(step)) this.write(this.live, step, index);
  }

  /** A stepped figure numbers its caption with the stepper's dot; a single step has nothing to count. */
  private write(el: HTMLElement, step: StepText, index: number): void {
    if (this.steps.length < 2) return writeStep(el, step, this.render);
    el.classList.add('is-numbered');
    writeNumbered(el, step, index, this.render, 'clew-step-dot is-current');
  }
}

const hasText = (step: StepText): boolean => Boolean(step.caption || step.heading);
