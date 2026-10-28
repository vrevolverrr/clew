/**
 * @jest-environment jsdom
 */
import { prepareDisplayOnlyInlineCode, restoreDisplayOnlyInlineCode } from '@/renderer/markdown/obsidian/DisplayOnlyInlineCode';

describe('DisplayOnlyInlineCode', () => {
  it('replaces the content of every inline code span, wherever it sits', () => {
    const markdown = [
      'Run `= this.file.name` or ``$= dv.el("b", `x`)`` now.',
      '- item `$= app.vault`',
      '> quote `= 1 +',
      '> 2`',
      '| cell | `= x` |',
    ].join('\n');

    const prepared = prepareDisplayOnlyInlineCode(markdown);

    expect(prepared.markdown).toBe([
      'Run `clew-inline-code-0` or ``clew-inline-code-1`` now.',
      '- item `clew-inline-code-2`',
      '> quote `clew-inline-code-3`',
      '| cell | `clew-inline-code-4` |',
    ].join('\n'));
    expect(prepared.spans).toEqual(['= this.file.name', '$= dv.el("b", `x`)', '$= app.vault', '= 1 + > 2', '= x']);
  });

  it('leaves fenced code, escaped backticks, and unclosed spans alone', () => {
    const markdown = ['\\`= not code\\`', '```js', '`= in a fence`', '```', 'open `= never closed'].join('\n');

    expect(prepareDisplayOnlyInlineCode(markdown)).toEqual({ markdown, spans: [] });
  });

  it('restores span text into inline code but not into fenced code', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p><code>clew-inline-code-0</code></p><pre><code>clew-inline-code-0</code></pre>';

    restoreDisplayOnlyInlineCode(container, ['$= dv.x']);

    expect(container.querySelector('p code')?.textContent).toBe('$= dv.x');
    expect(container.querySelector('pre code')?.textContent).toBe('clew-inline-code-0');
  });
});
