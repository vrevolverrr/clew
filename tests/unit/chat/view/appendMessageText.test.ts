/**
 * @jest-environment jsdom
 */
import { appendMessageText } from '@/chat/view/appendMessageText';

const MENTIONS = new Map([['Week 1.md', '/v/notes/Week 1.md']]);

function draw(text: string, options: Partial<Parameters<typeof appendMessageText>[2]> = {}): HTMLElement {
  const el = document.createElement('div');
  appendMessageText(el, text, { skill: { prefix: '/', atStart: true }, mentions: new Map(), ...options });
  return el;
}

const spans = (el: HTMLElement): [string, string][] => [...el.querySelectorAll('span')].map((span) => [span.className, span.textContent ?? '']);

describe('appendMessageText', () => {
  it('colors a skill name and a picked file, each in its own span, and keeps the text between', () => {
    const el = draw('/review @Week 1.md please', { mentions: MENTIONS });
    expect(spans(el)).toEqual([
      ['clew-skill-token', '/review'],
      ['clew-mention-token', '@Week 1.md'],
    ]);
    expect(el.textContent).toBe('/review @Week 1.md please');
  });

  it('shows the file path on hover', () => {
    expect(draw('@Week 1.md', { mentions: MENTIONS }).querySelector('.clew-mention-token')?.getAttribute('title')).toBe('/v/notes/Week 1.md');
  });

  it('colors the name being typed like a skill name', () => {
    const el = draw('compare @we', { typing: { start: 8, end: 11 } });
    expect(spans(el)).toEqual([['clew-skill-token', '@we']]);
  });

  it('draws a picked file, not the typing range, where the two overlap', () => {
    const el = draw('@Week 1.md', { mentions: MENTIONS, typing: { start: 0, end: 5 } });
    expect(spans(el)).toEqual([['clew-mention-token', '@Week 1.md']]);
    expect(el.textContent).toBe('@Week 1.md');
  });

  it('leaves an @ that was never picked as plain text', () => {
    expect(spans(draw('mail @bob'))).toEqual([]);
  });

  it('draws each $...$ span through the math callback and leaves other dollar signs as text', () => {
    const el = draw('Answer $\\sin x$ costs $5', { math: (source) => Object.assign(document.createElement('i'), { textContent: `[${source}]` }) });

    expect(el.innerHTML).toBe('Answer <i>[\\sin x]</i> costs $5');
  });

  it('keeps dollar signs as text when no math callback is given, as in the box being typed in', () => {
    expect(draw('Answer $\\sin x$').innerHTML).toBe('Answer $\\sin x$');
  });
});
