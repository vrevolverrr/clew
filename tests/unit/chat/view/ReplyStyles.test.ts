/** @jest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('reply Markdown styles', () => {
  afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  it.each(['ltr', 'rtl'])('reduces list margins on the reply root in %s without changing notes', (direction) => {
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = `
      .markdown-rendered ul > li, .markdown-rendered ol > li { margin-inline-start: 3ch; }
      .markdown-rendered ul ul > li, .markdown-rendered ol ol > li { margin-inline-start: 4ch; }
    ` + readFileSync(resolve(__dirname, '../../../../styles.css'), 'utf8');
    const lists = '<ul><li>Bullet<ul><li>Nested bullet</li></ul></li></ul><ol start="10"><li>Number<ol><li>Nested number</li></ol></li></ol>';
    const reply = document.body.appendChild(document.createElement('div'));
    // ChatView gives the reply both classes on the same element.
    reply.className = 'clew-reply markdown-rendered';
    reply.dir = direction;
    reply.innerHTML = `<div class="clew-reply-text"><div class="clew-reply-prose"><div>${lists}</div></div></div>`;
    const note = document.body.appendChild(document.createElement('div'));
    note.className = 'markdown-rendered';
    note.innerHTML = lists;
    const margins = (host: HTMLElement, selector: string) => [...host.querySelectorAll(selector)]
      .map(item => getComputedStyle(item).marginInlineStart);

    expect(margins(reply, 'ul > li')).toEqual(['2ch', '2ch']);
    expect(margins(reply, 'ol > li')).toEqual(['2.5ch', '2.5ch']);
    expect(margins(note, 'ul > li')).toEqual(['3ch', '4ch']);
    expect(margins(note, 'ol > li')).toEqual(['3ch', '4ch']);
  });

  it.each(['clew-reply-prose', 'clew-text'])('fills Markdown tables and distinguishes headers in %s', (className) => {
    const style = document.head.appendChild(document.createElement('style'));
    // jsdom does not resolve CSS variables; substitute a light theme's two surfaces.
    style.textContent = '.markdown-rendered table { width: fit-content; }'
      + readFileSync(resolve(__dirname, '../../../../styles.css'), 'utf8')
        .replaceAll('var(--background-secondary)', '#eeeeee')
        .replaceAll('var(--background-primary)', '#ffffff');
    const table = '<div class="table-wrapper"><table><thead><tr><th>Join</th><th>Disk I/Os</th></tr></thead><tbody><tr><td>Nested loop</td><td>5,500</td></tr></tbody></table></div>';
    const reply = document.body.appendChild(document.createElement('div'));
    reply.className = 'clew-reply markdown-rendered';
    reply.innerHTML = `<div class="${className}"><p>Before</p>${table}<p>Between</p>${table}<p>After</p></div>`;
    const note = document.body.appendChild(document.createElement('div'));
    note.className = 'markdown-rendered';
    note.innerHTML = table;
    const content = reply.querySelector<HTMLElement>(`.${className}`)!;

    expect(getComputedStyle(content).overflowX).not.toBe('auto');
    expect(getComputedStyle(reply).overflowX).not.toBe('auto');
    const wrappers = [...content.querySelectorAll('.table-wrapper')];
    expect(wrappers).toHaveLength(2);
    for (const wrapper of wrappers) {
      expect(getComputedStyle(wrapper).overflowX).toBe('auto');
      expect(getComputedStyle(wrapper).maxWidth).toBe('100%');
      expect(getComputedStyle(wrapper).minWidth).toBe('0');
    }
    expect(getComputedStyle(content.querySelector('.table-wrapper')!).width).toBe('100%');
    expect(getComputedStyle(content.querySelector('table')!).width).toBe('100%');
    expect(getComputedStyle(content.querySelector('th')!).backgroundColor).toBe('rgb(238, 238, 238)');
    expect(getComputedStyle(content.querySelector('td')!).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(note.querySelector('table')!).width).toBe('fit-content');
    expect(getComputedStyle(note.querySelector('th')!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });
});
