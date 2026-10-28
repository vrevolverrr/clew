/**
 * @jest-environment jsdom
 */
import { contextMeter } from '@/chat/view/ContextMeter';

import '../../../setupDom';

function setup() {
  const parent = document.createElement('div');
  const meter = contextMeter(parent);
  return { meter, ring: parent.firstElementChild as HTMLElement };
}

describe('contextMeter', () => {
  it('starts hidden', () => {
    expect(setup().ring.hasClass('is-empty')).toBe(true);
  });

  it('shows the share and labels it in thousands of tokens', () => {
    const { meter, ring } = setup();

    meter.set(84_000, 200_000);

    expect(ring.hasClass('is-empty')).toBe(false);
    expect(ring.getAttribute('aria-label')).toBe('Context 42%: 84k / 200k tokens');
    expect(ring.style.getPropertyValue('--clew-context-share')).toBe('42%');
    expect(ring.dataset.high).toBe('false');
  });

  it('flags a nearly full window and caps the ring at full', () => {
    const { meter, ring } = setup();

    meter.set(210_000, 200_000);

    expect(ring.dataset.high).toBe('true');
    expect(ring.style.getPropertyValue('--clew-context-share')).toBe('100%');
  });

  it('hides again on clear', () => {
    const { meter, ring } = setup();
    meter.set(1, 2);

    meter.clear();

    expect(ring.hasClass('is-empty')).toBe(true);
  });
});
