import type { TourStep } from '@/chat/ChatRecord';
import { dwell, HighlightTour, type Pause, type TourEvent, type TourStage } from '@/tour/HighlightTour';

const step = (quote: string, comment?: string): TourStep => ({ path: 'a.md', quote, comment });

/** Pauses that end when the test says so, or when the tour skips them, so the order of events is exact. */
function setup(placed: (step: TourStep) => boolean = () => true) {
  const events: string[] = [];
  const pauses: Array<{ ms: number; end: () => void }> = [];
  const timings: number[] = [];
  const stage: TourStage = {
    show: async (s) => {
      events.push(`show:${s.quote}`);
      return placed(s);
    },
    timing: (ms) => timings.push(ms),
    rest: () => events.push('rest'),
    clear: () => events.push('clear'),
  };
  const pause: Pause = (ms, signal) =>
    new Promise((resolve) => {
      events.push(`pause:${ms}`);
      pauses.push({ ms, end: resolve });
      if (signal.aborted) resolve();
      signal.addEventListener('abort', () => resolve());
    });
  const tour = new HighlightTour(stage, pause);
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  const finish = async (n: number): Promise<void> => {
    pauses[n]!.end();
    await settle();
  };
  return { tour, events, pauses, timings, settle, finish };
}

const shown = (events: string[]): string[] => events.filter((event) => event.startsWith('show:'));

describe('dwell', () => {
  it('grows with the marked text and the comment, and stays within bounds', () => {
    expect(dwell(step('x'))).toBe(2000);
    expect(dwell(step('x'.repeat(40)))).toBe(2600);
    expect(dwell(step('x'.repeat(40), 'a'.repeat(40)))).toBe(4000);
    expect(dwell(step('x'.repeat(400), 'a'.repeat(160)))).toBe(7000);
  });
});

describe('HighlightTour', () => {
  it('shows each step in turn, holding each for its dwell, then rests', async () => {
    const { tour, events, settle, finish } = setup();

    tour.add(step('one', 'a'.repeat(40)));
    tour.add(step('two'));
    await settle();
    expect(events).toEqual(['show:one', 'pause:2705']);
    await finish(0);
    await finish(1);

    expect(events.slice(2)).toEqual(['show:two', 'pause:2000', 'rest']);
  });

  it('plays a step that arrives while a pause is running, and rests only after the last', async () => {
    const { tour, events, settle, finish } = setup();

    tour.add(step('one'));
    await settle();
    tour.add(step('late'));
    await finish(0);
    await finish(1);

    expect(shown(events)).toEqual(['show:one', 'show:late']);
    expect(events.at(-1)).toBe('rest');
  });

  it('starts again when steps come after it rested', async () => {
    const { tour, events, settle, finish } = setup();

    tour.add(step('one'));
    await settle();
    await finish(0);
    tour.add(step('two'));
    await settle();

    expect(shown(events)).toEqual(['show:one', 'show:two']);
  });

  it('skips a step that cannot be placed without waiting on it', async () => {
    const { tour, events, pauses, settle } = setup((s) => s.quote !== 'gone');

    tour.add(step('gone'));
    tour.add(step('here'));
    await settle();

    expect(shown(events)).toEqual(['show:gone', 'show:here']);
    expect(pauses).toHaveLength(1);
  });

  it('tells the stage how long each step stays, and again for the grace period after a hold', async () => {
    const { tour, timings, settle, finish } = setup();

    tour.add(step('one', 'a'.repeat(40)));
    tour.add(step('two'));
    await settle();
    tour.hold(true);
    await finish(0);
    tour.hold(false);
    await settle();
    await finish(1);
    await finish(2);

    expect(timings).toEqual([2705, 1500, 2000]);
  });

  it('holds a step past its time, and lets go two seconds after the student does', async () => {
    const { tour, events, pauses, settle, finish } = setup();

    tour.add(step('one'));
    tour.add(step('two'));
    await settle();
    tour.hold(true);
    await finish(0);
    expect(shown(events)).toEqual(['show:one']);

    tour.hold(false);
    await settle();
    expect(pauses.map((p) => p.ms)).toEqual([2000, 1500]);
    expect(shown(events)).toEqual(['show:one']);
    await finish(1);
    expect(shown(events)).toEqual(['show:one', 'show:two']);
  });

  it('stop rests at once and ignores the rest of that reply until reset', async () => {
    const { tour, events, pauses, settle } = setup();

    tour.add(step('one'));
    tour.add(step('two'));
    await settle();
    tour.stop();
    await settle();
    tour.add(step('three'));
    await settle();
    expect(shown(events)).toEqual(['show:one']);
    expect(events.at(-1)).toBe('rest');

    tour.reset();
    tour.add(step('four'));
    await settle();
    expect(shown(events)).toEqual(['show:one', 'show:four']);
    expect(pauses).toHaveLength(2);
  });

  it('plays no more than twelve steps of a reply', async () => {
    const { tour, events, pauses, settle } = setup();

    for (let n = 0; n < 15; n++) tour.add(step(`s${n}`));
    for (let n = 0; n < 15; n++) {
      await settle();
      pauses[n]?.end();
    }
    await settle();

    expect(shown(events)).toHaveLength(12);
  });

  it('reset also clears the marks', async () => {
    const { tour, events, settle } = setup();

    tour.add(step('one'));
    await settle();
    tour.reset();

    expect(events.slice(-2)).toEqual(['rest', 'clear']);
  });

  it('keeps going when the stage throws on one step', async () => {
    const events: string[] = [];
    const stage: TourStage = {
      show: async (s) => {
        if (s.quote === 'bad') throw new Error('no view');
        events.push(`show:${s.quote}`);
        return true;
      },
      timing: () => undefined,
      rest: () => events.push('rest'),
      clear: () => undefined,
    };
    const tour = new HighlightTour(stage, async () => undefined);
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);

    tour.add(step('bad'));
    tour.add(step('good'));
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(events).toEqual(['show:good', 'rest']);
  });

  describe('for a list of steps', () => {
    it('tells listeners which step is on screen, which could not be found, and when it rests', async () => {
      const { tour, settle, finish } = setup((s) => s.quote !== 'gone');
      const seen: Array<TourEvent> = [];
      const stop = tour.subscribe((event) => seen.push(event));
      const [one, gone, two] = [step('one'), step('gone'), step('two')];

      tour.add(one);
      tour.add(gone);
      tour.add(two);
      await settle();
      await finish(0);
      await finish(1);
      stop();
      tour.add(step('after'));
      await settle();

      expect(seen).toEqual([
        { step: one, state: 'playing' },
        { step: gone, state: 'missed' },
        { step: two, state: 'playing' },
        null,
      ]);
    });

    it('playFrom starts at the chosen step, clears the marks first, and carries on to the end', async () => {
      const { tour, events, settle, finish } = setup();
      const steps = [step('one'), step('two'), step('three')];

      tour.playFrom(steps, 1);
      await settle();
      expect(events.slice(0, 3)).toEqual(['rest', 'clear', 'show:two']);
      await finish(0);

      expect(shown(events)).toEqual(['show:two', 'show:three']);
    });

    it('playFrom works after a stop, and again while a tour is playing', async () => {
      const { tour, events, settle } = setup();
      const steps = [step('one'), step('two')];

      tour.stop();
      tour.playFrom(steps, 0);
      await settle();
      tour.playFrom(steps, 1);
      await settle();

      expect(shown(events)).toEqual(['show:one', 'show:two']);
    });
  });
});
