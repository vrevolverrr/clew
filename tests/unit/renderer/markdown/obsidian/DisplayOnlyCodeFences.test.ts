/**
 * @jest-environment jsdom
 */
import { loadPrism } from 'obsidian';

import {
  prepareDisplayOnlyCodeFences,
  restoreDisplayOnlyCodeFences,
} from '@/renderer/markdown/obsidian/DisplayOnlyCodeFences';

jest.mock('obsidian', () => ({ loadPrism: jest.fn() }), { virtual: true });

function createEl(parent: HTMLElement, tag: string, cls: string, text = ''): HTMLElement {
  const el = parent.appendChild(document.createElement(tag));
  el.className = cls;
  el.textContent = text;
  return el;
}

describe('DisplayOnlyCodeFences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('replaces every fenced language while preserving fence structure and metadata', () => {
    const markdown = [
      '> ```dataview',
      '> TABLE file.name',
      '> ```',
      '- ~~~typescript title="sample"',
      '  const value = 1;',
      '  ~~~',
    ].join('\n');

    const prepared = prepareDisplayOnlyCodeFences(markdown);

    expect(prepared.markdown).toBe([
      '> ```clew-display-only-fence-0',
      '> TABLE file.name',
      '> ```',
      '- ~~~clew-display-only-fence-1 title="sample"',
      '  const value = 1;',
      '  ~~~',
    ].join('\n'));
    expect(prepared.fences).toEqual([
      {
        placeholderLanguage: 'clew-display-only-fence-0',
        originalLanguage: 'dataview',
      },
      {
        placeholderLanguage: 'clew-display-only-fence-1',
        originalLanguage: 'typescript',
      },
    ]);
  });

  it('does not treat fence-like content inside an outer fence as a new block', () => {
    const markdown = [
      '````markdown',
      '```dataview',
      'TABLE file.name',
      '```',
      '````',
    ].join('\n');

    const prepared = prepareDisplayOnlyCodeFences(markdown);

    expect(prepared.markdown).toBe([
      '````clew-display-only-fence-0',
      '```dataview',
      'TABLE file.name',
      '```',
      '````',
    ].join('\n'));
    expect(prepared.fences).toHaveLength(1);
    expect(prepared.fences[0].originalLanguage).toBe('markdown');
  });

  it('protects unclosed streaming fences and leaves non-language syntax unchanged', () => {
    const markdown = [
      '` ```dataview`',
      '```',
      'plain code',
      '```',
      '```dataview',
      'TABLE file.name',
    ].join('\n');

    const prepared = prepareDisplayOnlyCodeFences(markdown);

    expect(prepared.markdown).toBe([
      '` ```dataview`',
      '```',
      'plain code',
      '```',
      '```clew-display-only-fence-0',
      'TABLE file.name',
    ].join('\n'));
    expect(prepared.fences).toHaveLength(1);
  });

  it('restores original language classes and reapplies Prism highlighting', async () => {
    const highlightElement = jest.fn();
    (loadPrism as jest.Mock).mockResolvedValueOnce({ highlightElement });
    const container = document.createElement('div');
    const code = createEl(container, 'code', 'language-clew-display-only-fence-0 extra-class', 'const value = 1;');

    await restoreDisplayOnlyCodeFences(container, [{
      placeholderLanguage: 'clew-display-only-fence-0',
      originalLanguage: 'typescript',
    }]);

    expect(code.classList.contains('language-clew-display-only-fence-0')).toBe(false);
    expect(code.classList.contains('language-typescript')).toBe(true);
    expect(code.classList.contains('extra-class')).toBe(true);
    expect(highlightElement).toHaveBeenCalledWith(code);
  });

  it('restores the nested code element when Prism copies the placeholder class to pre', async () => {
    const highlightElement = jest.fn((element: HTMLElement) => {
      if (element.tagName === 'PRE') {
        element.replaceChildren();
      }
    });
    (loadPrism as jest.Mock).mockResolvedValueOnce({ highlightElement });
    const container = document.createElement('div');
    const placeholderClass = 'language-clew-display-only-fence-0';
    const pre = createEl(container, 'pre', placeholderClass);
    const code = createEl(pre, 'code', placeholderClass, 'const value = 1;');
    const copyButton = createEl(pre, 'button', 'copy-code-button');

    await restoreDisplayOnlyCodeFences(container, [{
      placeholderLanguage: 'clew-display-only-fence-0',
      originalLanguage: 'typescript',
    }]);

    expect(code.classList.contains(placeholderClass)).toBe(false);
    expect(code.classList.contains('language-typescript')).toBe(true);
    expect(highlightElement).toHaveBeenCalledWith(code);
    expect(pre.querySelector('.copy-code-button')).toBe(copyButton);
  });

  it('restores language classes even when Prism loading fails', async () => {
    (loadPrism as jest.Mock).mockRejectedValueOnce(new Error('Prism unavailable'));
    const container = document.createElement('div');
    const code = createEl(container, 'code', 'language-clew-display-only-fence-0', 'TABLE file.name');

    await expect(restoreDisplayOnlyCodeFences(container, [{
      placeholderLanguage: 'clew-display-only-fence-0',
      originalLanguage: 'dataview',
    }])).resolves.toBeUndefined();

    expect(code.classList.contains('language-dataview')).toBe(true);
  });
});
