/**
 * @jest-environment jsdom
 */
import type { App, Component } from 'obsidian';
import { MarkdownRenderer } from 'obsidian';

import { MarkdownContentRenderer } from '@/renderer/markdown/obsidian/MarkdownContentRenderer';

jest.mock('obsidian', () => {
  class Component {
    private children: Component[] = [];
    private callbacks: Array<() => void> = [];
    load(): void {}
    unload(): void {
      this.children.forEach((child) => child.unload());
      this.callbacks.forEach((callback) => callback());
    }
    addChild<T extends Component>(child: T): T {
      this.children.push(child);
      return child;
    }
    removeChild<T extends Component>(child: T): T {
      child.unload();
      return child;
    }
    register(callback: () => void): void {
      this.callbacks.push(callback);
    }
  }
  return { Component, Modal: class {}, setIcon: jest.fn(), MarkdownRenderer: { render: jest.fn() }, finishRenderMath: jest.fn(), loadPrism: jest.fn().mockRejectedValue(new Error('none')) };
}, { virtual: true });

const render = MarkdownRenderer.render as jest.Mock;

// Stands in for Obsidian plus a plugin post-processor that executes inline code by prefix, like Dataview.
function renderAndRunInlineProcessors(executed: string[]) {
  render.mockImplementation(async (_app: App, markdown: string, el: HTMLElement) => {
    el.innerHTML = markdown
      .split('\n')
      .map((line) => `<p>${line.replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`)
      .join('');
    for (const code of Array.from(el.querySelectorAll('code'))) {
      if (/^\$?=/.test(code.textContent ?? '')) executed.push(code.textContent ?? '');
    }
  });
}

function createRenderer() {
  const { Component: MockComponent } = jest.requireMock('obsidian') as { Component: new () => Component };
  const root = document.createElement('div');
  return { root, renderer: new MarkdownContentRenderer({} as App, new MockComponent(), () => 'notes/Lecture.md') };
}

describe('MarkdownContentRenderer', () => {
  beforeEach(() => {
    render.mockReset();
  });

  it('never lets post-processors see inline code from model output, and shows it as written', async () => {
    const executed: string[] = [];
    renderAndRunInlineProcessors(executed);
    const { root, renderer } = createRenderer();
    const el = root.appendChild(document.createElement('div'));

    await renderer.render(el, 'Try `= this.file.name` and `$= app.vault.adapter`.');

    expect(executed).toEqual([]);
    expect(Array.from(el.querySelectorAll('code'), (code) => code.textContent)).toEqual([
      '= this.file.name',
      '$= app.vault.adapter',
    ]);
  });

  it('renders against the active note path', async () => {
    renderAndRunInlineProcessors([]);
    const { root, renderer } = createRenderer();

    await renderer.render(root.appendChild(document.createElement('div')), 'text');

    expect(render).toHaveBeenCalledWith(expect.anything(), 'text', expect.any(HTMLElement), 'notes/Lecture.md', expect.anything());
  });

  it('runs `after` on the finished render, where each code block has its own language back', async () => {
    render.mockImplementation(async (_app: App, markdown: string, el: HTMLElement) => {
      const [, language, code] = /^```(\S+)\n([\s\S]*?)\n```$/.exec(markdown)!;
      el.innerHTML = `<pre><code class="language-${language}">${code}</code></pre>`;
    });
    const { root, renderer } = createRenderer();
    const el = root.appendChild(document.createElement('div'));
    const seen: Array<{ languages: string[]; current: boolean }> = [];

    await renderer.render(el, '```mermaid\nflowchart LR\n```', async (target, isCurrent) => {
      seen.push({ languages: [...target.querySelectorAll('code')].map((code) => code.className), current: isCurrent() });
    });

    expect(seen).toEqual([{ languages: ['language-mermaid'], current: true }]);
  });

  it('gives each table its own wrapper and reuses host wrappers without wrapping prose', async () => {
    let existing: Element | null = null;
    render.mockImplementation(async (_app: App, _markdown: string, el: HTMLElement) => {
      el.innerHTML = '<p>Before</p><table><tr><td>First</td></tr></table><p>Between</p>'
        + '<div class="table-wrapper"><table><tr><td>Second</td></tr></table></div>'
        + '<table><tr><td>Third</td></tr></table><p>After</p>';
      existing = el.querySelector('.table-wrapper');
    });
    const { root, renderer } = createRenderer();
    const el = root.appendChild(document.createElement('div'));

    await renderer.render(el, 'tables and surrounding prose');

    const wrappers = [...el.querySelectorAll('.table-wrapper')];
    expect(wrappers).toHaveLength(3);
    expect(wrappers[1]).toBe(existing);
    expect(wrappers.map(wrapper => wrapper.textContent)).toEqual(['First', 'Second', 'Third']);
    expect(wrappers.every(wrapper => wrapper.children.length === 1 && wrapper.firstElementChild?.tagName === 'TABLE')).toBe(true);
    expect([...el.children].map(child => child.tagName)).toEqual(['P', 'DIV', 'P', 'DIV', 'DIV', 'P']);
  });
});
