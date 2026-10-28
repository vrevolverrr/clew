import type { TourStep } from '@/chat/ChatRecord';
import type { TourEvent } from '@/tour/HighlightTour';

/** What a walkthrough needs of the chat: to start the tour at a stop, and to hear which stop is on screen. */
export interface WalkthroughHost {
  /** The student picked stop `index` of `steps`: show it, then carry on from there. */
  pick(steps: readonly TourStep[], index: number): void;
  /** Tells `listener` which stop is on screen, for as long as the chat shows this walkthrough. */
  watch(listener: (event: TourEvent) => void): void;
}

const SNIPPET_WORDS = 8;
const MISSED = 'The text was not found, so the note may have changed.';

/** The start of a quote, for a stop that has no comment of its own. */
function snippet(quote: string): string {
  const words = quote.trim().split(/\s+/);
  return words.length > SNIPPET_WORDS ? `${words.slice(0, SNIPPET_WORDS).join(' ')}…` : words.join(' ');
}

function noteName(path: string): string {
  return path.split('/').pop()!.replace(/\.md$/, '');
}

/**
 * A run of the stops an agent pointed at, drawn in the reply where it wrote them. One list of stops belongs to the
 * whole reply and a run shows its own part of it, so a stop's number and what a click plays are the reply's, not the
 * run's. As the tour plays, the stop on screen is marked, the ones before it count as seen, and a click on any stop plays
 * from there.
 */
export class Walkthrough {
  private readonly rows: Array<{ index: number; row: HTMLElement }> = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly steps: readonly TourStep[],
    private readonly host: WalkthroughHost,
  ) {
    host.watch((event) => this.mark(event));
  }

  /** Draws the stop just added to the reply's list, which is the last of `steps`. */
  add(): void {
    const index = this.steps.length - 1;
    const step = this.steps[index]!;
    const row = this.el.createEl('button', { cls: 'clew-walk-step', attr: { type: 'button', 'aria-label': `Show stop ${index + 1}` } });
    row.createSpan({ cls: 'clew-walk-num', text: String(index + 1) });
    const body = row.createSpan({ cls: 'clew-walk-body' });
    body.createSpan({ cls: 'clew-walk-comment', text: step.comment ?? snippet(step.quote) });
    if (step.comment) body.createSpan({ cls: 'clew-walk-quote', text: snippet(step.quote) });
    if (step.path !== this.steps[0]!.path) body.createSpan({ cls: 'clew-walk-note', text: noteName(step.path) });
    row.addEventListener('click', () => this.host.pick(this.steps, index));
    this.rows.push({ index, row });
  }

  private mark(event: TourEvent): void {
    const playing = event ? this.steps.indexOf(event.step) : -1;
    for (const { index, row } of this.rows) {
      row.toggleClass('is-active', event?.state === 'playing' && index === playing);
      if (!event) continue;
      row.toggleClass('is-seen', index < playing);
      if (index === playing) {
        row.toggleClass('is-missed', event.state === 'missed');
        row.title = event.state === 'missed' ? MISSED : '';
      }
    }
  }
}
