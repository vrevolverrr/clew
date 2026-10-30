import { type StepText, writeStep } from '@/renderer/figure/StepList';

/** The current caption over an invisible stack of every caption, so wrapping and resizing keep the tallest one's height. */
export class CaptionStack {
  readonly el = createDiv();
  private readonly live = createDiv();
  private readonly sizes = createDiv();
  private steps: readonly StepText[] = [];
  private shown?: StepText;

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
    if (steps.length === this.steps.length && steps.every((step, i) => same(step, this.steps[i]))) return;
    this.steps = steps;
    this.sizes.replaceChildren(...steps.flatMap((step, index) => {
      if (!step.caption) return [];
      const size = createDiv();
      size.className = 'clew-caption';
      this.write(size, step, index);
      return [size];
    }));
    this.el.hidden = !steps.some((step) => step.caption);
  }

  show(index: number): void {
    const step = this.steps[index];
    if (step === this.shown || (step && this.shown && same(step, this.shown))) return;
    this.shown = step;
    this.live.replaceChildren();
    if (step?.caption) this.write(this.live, step, index);
  }

  /** A stepped figure numbers its caption with the stepper's dot; a single step has nothing to count. */
  private write(el: HTMLElement, step: StepText, index: number): void {
    if (this.steps.length < 2) return writeStep(el, step, this.render);
    el.classList.add('is-numbered');
    el.createSpan({ cls: 'clew-step-dot is-current', text: String(index + 1) });
    writeStep(el.createDiv({ cls: 'clew-step-text' }), step, this.render);
  }
}

const same = (a: StepText, b: StepText): boolean => a.caption === b.caption && a.heading === b.heading;
