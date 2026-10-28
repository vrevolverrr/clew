/** @jest-environment jsdom */

import { library } from '@/renderer/openui/library';
import { OpenUIRenderer } from '@/renderer/openui/OpenUIRenderer';

describe('Sequence', () => {
  let host: HTMLElement;
  let renderer: OpenUIRenderer;
  let markdown: jest.Mock;

  beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'));
    markdown = jest.fn((el: HTMLElement, text: string) => { el.textContent = text; });
    renderer = new OpenUIRenderer(host, library, markdown);
  });

  afterEach(() => {
    renderer.destroy();
    host.remove();
  });

  it('renders every item in an ordered list through the existing Markdown renderer', () => {
    const texts = [
      '### Insert [10, 20]\nBoth keys **fit**: $m - 1 = 2$.',
      '### Split the leaf\n1. Insert `30`.\n2. Copy the separator.\n   - Keep the leaf links.',
    ];
    const result = renderer.set(`root = Stack([TextContent("Introduction"), Sequence([${texts.map(text => `TextContent(${JSON.stringify(text)})`).join(', ')}])])`, true);

    expect(result.meta.errors).toEqual([]);
    const list = host.querySelector('ol.clew-sequence')!;
    expect(list.getAttribute('role')).toBe('list');
    expect([...list.children].map(item => item.tagName)).toEqual(['LI', 'LI']);
    expect([...list.querySelectorAll('li > .clew-text')].map(item => item.textContent)).toEqual(texts);
    expect(markdown.mock.calls.map(([, text]) => text)).toEqual(['Introduction', ...texts]);
    expect(host.querySelector('button')).toBeNull();
  });

  it('handles an empty sequence and adds, updates and removes items on redraw', () => {
    const program = (texts: string[]) => `root = Stack([Sequence([${texts.map(text => `TextContent(${JSON.stringify(text)})`).join(', ')}])])`;
    renderer.set(program([]), true);
    const list = host.querySelector('ol.clew-sequence')!;
    expect(list.children).toHaveLength(0);

    renderer.set(program(['First', 'Second', 'Third']), true);
    const first = list.firstElementChild;
    const text = first!.firstElementChild;
    renderer.set(program(['Changed']), true);

    expect(list.children).toHaveLength(1);
    expect(list.firstElementChild).toBe(first);
    expect(first!.firstElementChild).toBe(text);
    expect(list.textContent).toBe('Changed');

    renderer.set(program([]), true);
    expect(list.children).toHaveLength(0);
    renderer.set(program(['New first', 'New second']), true);
    expect([...list.children].map(item => item.textContent)).toEqual(['New first', 'New second']);
  });

  it('resolves streamed references in declaration order without leaving empty items', () => {
    const prefix = 'root = Stack([Sequence([first, second])])\nsecond = TextContent("Second")';
    renderer.set(prefix);
    expect([...host.querySelectorAll('.clew-sequence > li')].map(item => item.textContent)).toEqual(['Second']);

    const result = renderer.set(`${prefix}\nfirst = TextContent("First")`, true);
    expect(result.meta.errors).toEqual([]);
    expect([...host.querySelectorAll('.clew-sequence > li')].map(item => item.textContent)).toEqual(['First', 'Second']);
  });
});
