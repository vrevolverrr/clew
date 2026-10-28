import type { TourStep } from '@/chat/ChatRecord';

/** What a tour draws on. Rendering and the editor sit behind it, so the tour's timing tests without Obsidian. */
export interface TourStage {
  /** Brings the step on screen and resolves once it shows. False when it cannot be placed. A stage must not draw after `signal` aborts. */
  show(step: TourStep, signal: AbortSignal): Promise<boolean>;
  /** The step on screen will stay about this long, counted from now; told again with the grace period after a hold. */
  timing(ms: number): void;
  /** The tour has nothing on screen to point at for now. The stage lets the last mark go after a moment. */
  rest(): void;
  /** Takes every mark away at once. */
  clear(): void;
}

/** What the tour is doing, for whoever lists its steps: a step on screen, or one whose text could not be found. Null when it rests. */
export type TourEvent = { step: TourStep; state: 'playing' | 'missed' } | null;

export type Pause = (ms: number, signal: AbortSignal) => Promise<void>;

const MIN_DWELL_MS = 2000;
const MAX_DWELL_MS = 7000;
const BASE_DWELL_MS = 1200;
const MS_PER_CHARACTER = 35;
// After the student lets go of a held step, it stays this long so the text they were reading does not vanish.
const GRACE_MS = 1500;
// A reply that points at this many places is not pointing at anything.
const MAX_STEPS = 12;

/** Time to read the marked text and the comment beside it. */
export function dwell({ quote, comment }: TourStep): number {
  return Math.min(MAX_DWELL_MS, Math.max(MIN_DWELL_MS, BASE_DWELL_MS + MS_PER_CHARACTER * (quote.length + (comment?.length ?? 0))));
}

function pauseFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = (): void => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = window.setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });
}

/**
 * Plays the agent's highlights one at a time, each held long enough to read, while the reply is still streaming.
 * The student can hold a step, start again from any step, or stop. A step that arrives during a pause waits its turn;
 * a step that cannot be placed is skipped without a pause.
 */
export class HighlightTour {
  private steps: TourStep[] = [];
  private upNext = 0;
  private held = false;
  private release: (() => void) | null = null;
  private stopped = false;
  private playing = false;
  private abort = new AbortController();
  private readonly listeners = new Set<(event: TourEvent) => void>();

  constructor(
    private readonly stage: TourStage,
    private readonly pause: Pause = pauseFor,
  ) {}

  add(step: TourStep): void {
    if (this.stopped || this.steps.length >= MAX_STEPS) return;
    this.steps.push(step);
    if (!this.playing) void this.loop();
  }

  /** Tells `listener` which step is on screen; returns the way to stop listening. */
  subscribe(listener: (event: TourEvent) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Plays `steps` from the one at `from`, in place of whatever was playing, with their marks cleared first. */
  playFrom(steps: readonly TourStep[], from: number): void {
    this.reset();
    this.steps = [...steps];
    this.upNext = from;
    if (this.upNext < this.steps.length) void this.loop();
  }

  /** While held, a step stays on screen however long it has been there. */
  hold(held: boolean): void {
    this.held = held;
    if (!held) this.release?.();
  }

  /** Ends the walk where it is: nothing more is shown, steps still to come from the same reply are ignored, and the last mark goes after a moment. */
  stop(): void {
    this.stopped = true;
    this.playing = false;
    this.abort.abort();
    this.release?.();
    this.stage.rest();
    this.emit(null);
  }

  /** Ends the walk, takes its marks away, and readies the tour for a new reply. */
  reset(): void {
    this.stop();
    this.stage.clear();
    this.steps = [];
    this.upNext = 0;
    this.held = false;
    this.stopped = false;
  }

  private emit(event: TourEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private async loop(): Promise<void> {
    this.playing = true;
    this.abort = new AbortController();
    const { signal } = this.abort;
    try {
      while (this.upNext < this.steps.length) {
        const step = this.steps[this.upNext++]!;
        const shown = await this.stage.show(step, signal).catch((error: unknown) => {
          console.debug('Clew: a highlight failed', error);
          return false;
        });
        if (signal.aborted) return;
        this.emit({ step, state: shown ? 'playing' : 'missed' });
        if (!shown) continue;
        await this.linger(step, signal);
        if (signal.aborted) return;
      }
    } finally {
      if (!signal.aborted) {
        this.playing = false;
        this.stage.rest();
        this.emit(null);
      }
    }
  }

  private async linger(step: TourStep, signal: AbortSignal): Promise<void> {
    const wait = async (ms: number): Promise<void> => {
      this.stage.timing(ms);
      await this.pause(ms, signal);
    };
    await wait(dwell(step));
    while (this.held && !signal.aborted) {
      await new Promise<void>((resolve) => (this.release = resolve));
      this.release = null;
      if (!signal.aborted) await wait(GRACE_MS);
    }
  }
}
