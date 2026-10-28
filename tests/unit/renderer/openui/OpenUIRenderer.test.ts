/**
 * @jest-environment jsdom
 */
import { defineComponent } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import { library } from '@/renderer/openui/library';
import type { ComponentFactory } from '@/renderer/openui/OpenUIRenderer';
import { OpenUIRenderer, strictComponent } from '@/renderer/openui/OpenUIRenderer';

const Input = defineComponent({
  name: 'Input',
  description: 'Text input.',
  props: z.object({ name: z.string(), placeholder: z.string().optional() }),
  component: (() => {
    const el = document.createElement('input');
    return {
      el,
      update: ({ name, placeholder }) => {
        el.name = String(name);
        el.placeholder = String(placeholder ?? '');
      },
    };
  }) satisfies ComponentFactory,
});

const withInput = library.extend({ components: { add: [{ component: Input, slots: ['Stack.children'] }] } });

const Fails = defineComponent({
  name: 'Fails',
  description: 'Throws when drawn.',
  props: z.object({ reason: z.string() }),
  component: (() => ({ el: document.createElement('div'), update: ({ reason }) => { throw new Error(String(reason)); } })) satisfies ComponentFactory,
});

const received: Record<string, unknown>[] = [];
const Strict = defineComponent({
  name: 'Strict',
  description: 'Records the props it gets.',
  props: z.object({ items: z.array(z.number()) }),
  component: strictComponent(() => ({ el: document.createElement('div'), update: (props) => { received.push(props); } })),
});

const withTestComponents = library.extend({ components: { add: [Fails, Strict].map((component) => ({ component, slots: ['Stack.children'] })) } });

const response = [
  'root = Stack([intro, answer, TextContent("Show your working."), note])',
  'intro = TextContent("Solve 2x + 3 = 11 for x.")',
  'answer = Input("x", "Your answer")',
  'note = TextContent("Check by substituting back.")',
].join('\n');

function mount(lib = withInput) {
  const host = document.body.appendChild(document.createElement('div'));
  const renderMarkdown = (el: HTMLElement, markdown: string) => {
    el.textContent = markdown;
  };
  return { host, renderer: new OpenUIRenderer(host, lib, renderMarkdown) };
}

function textOf(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.clew-text')].map((el) => el.textContent ?? '');
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('OpenUIRenderer', () => {
  it.each([1, 7])('keeps a typed input mounted, filled, and focused across %i-char chunks', (size) => {
    const { host, renderer } = mount();
    let input: HTMLInputElement | null = null;
    let intro: Element | null = null;

    for (let end = size; end < response.length + size; end += size) {
      renderer.set(response.slice(0, end));
      const current = host.querySelector('input');
      if (input) {
        expect(current).toBe(input);
        expect(input.value).toBe('42');
        expect(document.activeElement).toBe(input);
        expect(host.querySelector('.clew-text')).toBe(intro);
      } else if (current) {
        input = current;
        intro = host.querySelector('.clew-text');
        input.focus();
        input.value = '42';
      }
    }
    renderer.set(response, true);

    expect(host.querySelector('input')).toBe(input);
    expect(input?.value).toBe('42');
    expect(input?.placeholder).toBe('Your answer');
    expect(document.activeElement).toBe(input);
    expect(renderer.isStreaming).toBe(false);
  });

  it('places forward references in root order once their lines arrive', () => {
    const { host, renderer } = mount();

    renderer.set(response.split('\n')[0]!);
    expect(textOf(host)).toEqual(['Show your working.']);

    const result = renderer.set(response, true);

    expect(result.meta.errors).toEqual([]);
    expect(textOf(host)).toEqual(['Solve 2x + 3 = 11 for x.', 'Show your working.', 'Check by substituting back.']);
    expect(host.querySelector('.clew-stack > input')).toBe(host.querySelector('.clew-stack')?.children[1]);
  });

  it('drops components the library does not define and renders the rest', () => {
    const { host, renderer } = mount(library);

    const result = renderer.set('root = Stack([TextContent("kept"), Chart("bar")])', true);

    expect(result.meta.errors.map((error) => error.code)).toContain('unknown-component');
    expect(textOf(host)).toEqual(['kept']);
  });

  it('draws Callout as Markdown for the host renderer', () => {
    const { host, renderer } = mount(library);

    renderer.set([
      'root = Stack([c])',
      'c = Callout("tip", "Memory", "$M$ counts input buffers.\\nNot output.")',
    ].join('\n'), true);

    expect(host.querySelector('.clew-callout')?.textContent).toBe('> [!tip] Memory\n> $M$ counts input buffers.\n> Not output.');
  });

  it('removes nodes that a replaced response no longer contains', () => {
    const { host, renderer } = mount();
    renderer.set(response, true);

    renderer.set('root = Stack([TextContent("fresh")])', true);

    expect(textOf(host)).toEqual(['fresh']);
    expect(host.querySelector('input')).toBeNull();
  });

  it('shows each error once, a failed component in its place and a repair after the figure, with the source', () => {
    const { host, renderer } = mount(withTestComponents);
    const source = '$n = 1\nroot = Stack([TextContent("kept"), Fails("no data"), Chart("bar"), Slider("n", 0, 5, 1, $n)])';

    renderer.set(source, true);

    expect(textOf(host)).toEqual(['kept']);
    const failed = host.querySelector('.clew-stack')!.children[1]!;
    expect(failed.outerHTML).toBe('<div class="clew-visual-error">Fails: no data</div>');
    expect(renderer.errors).toEqual(['Chart: Unknown component "Chart"', 'Fails: no data']);
    expect([...host.querySelectorAll('.clew-visual-error')].map((el) => el.textContent)).toEqual(['Fails: no data', 'Chart: Unknown component "Chart"']);
    const details = host.lastElementChild!.querySelector('details')!;
    expect(details.querySelector('pre')!.textContent).toBe(source);

    details.open = true;
    const slider = host.querySelector<HTMLInputElement>('input[type=range]')!;
    slider.value = '3';
    slider.dispatchEvent(new Event('input'));

    expect(host.querySelector('.clew-stack')!.children[1]).toBe(failed);
    expect(host.querySelector('details')).toBe(details);
    expect(details.open).toBe(true);
  });

  it('drops the source block once the figure draws without errors', () => {
    const { host, renderer } = mount(withTestComponents);

    renderer.set('root = Stack([Fails("no data")])', true);
    renderer.set('root = Stack([TextContent("fixed")])', true);

    expect(renderer.errors).toEqual([]);
    expect(host.querySelector('details')).toBeNull();
  });

  it('shows no error while the response streams', () => {
    const { host, renderer } = mount(withTestComponents);

    renderer.set('root = Stack([Fails("partial")])');

    expect(host.querySelector('.clew-visual-error')).toBeNull();
    expect(renderer.errors).toEqual([]);
  });

  it('gives a strict component its arguments as written, evaluating them once unless they read a variable', () => {
    const { host, renderer } = mount(withTestComponents);
    received.length = 0;

    renderer.set('$n = 1\nroot = Stack([Strict([1, "two"]), Strict([$n]), Slider("n", 0, 5, 1, $n)])', true);
    expect(received).toEqual([{ items: [1, 'two'] }, { items: [1] }]);
    expect(renderer.errors).toEqual([]);

    const slider = host.querySelector<HTMLInputElement>('input[type=range]')!;
    slider.value = '3';
    slider.dispatchEvent(new Event('input'));
    expect(received.slice(2)).toEqual([{ items: [1, 'two'] }, { items: [3] }]);
    expect(received[2]).toBe(received[0]);
  });

  it('evaluates each definition once per draw, so doubling references cannot blow up', () => {
    const { host, renderer } = mount(withTestComponents);
    const levels = Array.from({ length: 40 }, (_, i) => `d${i} = [d${i + 1}, d${i + 1}]`).join('\n');

    const start = performance.now();
    renderer.set(`$n = 1\nroot = Stack([Strict(d0)])\n${levels}\nd40 = [$n]`, true);

    expect(performance.now() - start).toBeLessThan(1000);
    expect(host.querySelector('.clew-visual-error')).toBeNull();
  });

  it('rejects a strict call with excess arguments or an unknown call inside it', () => {
    const { host, renderer } = mount(withTestComponents);

    renderer.set('root = Stack([Strict([1], 2), Strict([Nope(1)])])', true);

    expect([...host.querySelectorAll('.clew-visual-error')].map((el) => el.textContent)).toEqual([
      'Strict: Strict takes 1 argument(s), got 2',
      'Strict: unknown component Nope',
    ]);
  });
});
