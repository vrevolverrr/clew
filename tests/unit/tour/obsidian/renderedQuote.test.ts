/**
 * @jest-environment jsdom
 */
import { renderedQuote } from '@/tour/obsidian/renderedQuote';

function page(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

const texts = (ranges: Range[]): string[] => ranges.map((range) => range.toString());

describe('renderedQuote', () => {
  it('finds a quote that runs through inline elements', () => {
    const root = page('<p>The <strong>slope</strong> is <em>steep</em> here.</p>');

    expect(texts(renderedQuote(root, 'The slope is steep'))).toEqual(['The slope is steep']);
  });

  it('matches a quote written with Markdown marks the page does not show', () => {
    expect(texts(renderedQuote(page('<p>The slope is steep.</p>'), 'The **slope** is `steep`'))).toEqual(['The slope is steep']);
  });

  it('reads the break between blocks as a space, and finds every place', () => {
    const root = page('<h2>Light</h2><p>Light bends.</p><ul><li>Light bends.</li></ul>');

    expect(texts(renderedQuote(root, 'Light Light'))).toEqual(['LightLight']);
    expect(texts(renderedQuote(root, 'Light bends.'))).toEqual(['Light bends.', 'Light bends.']);
  });

  it('skips rendered math and the code copy button', () => {
    const root = page('<p>Let <span class="math">x squared</span> grow</p><pre><button class="copy-code-button">Copy</button><code>go()</code></pre>');

    expect(renderedQuote(root, 'x squared')).toEqual([]);
    expect(renderedQuote(root, 'Copy go()')).toEqual([]);
    expect(texts(renderedQuote(root, 'go()'))).toEqual(['go()']);
  });

  it('does not find a quote inside a longer word', () => {
    expect(texts(renderedQuote(page('<p>concatenate the cat</p>'), 'cat'))).toEqual(['cat']);
  });

  it('returns nothing for text that is not drawn', () => {
    expect(renderedQuote(page('<p>Hello</p>'), 'Goodbye')).toEqual([]);
  });
});
