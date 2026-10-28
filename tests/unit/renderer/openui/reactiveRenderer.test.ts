/**
 * @jest-environment jsdom
 */
import { createLibrary, defineComponent, defineFunction } from '@openuidev/lang-core';
import { z } from 'zod/v4';

import type { ComponentFactory } from '@/renderer/openui/OpenUIRenderer';
import { OpenUIRenderer } from '@/renderer/openui/OpenUIRenderer';
import { reactive } from '@/renderer/openui/Controlled';

const Knob = defineComponent({
  name: 'Knob',
  description: 'A number control bound to a $variable.',
  props: z.object({ value: reactive(z.number()) }),
  component: ((ctx) => {
    const el = document.createElement('button');
    el.className = 'knob';
    return {
      el,
      update: ({ value }) => {
        const binding = ctx.bind(value);
        el.dataset.bound = String(binding.bound);
        el.textContent = String(binding.value);
        el.onclick = () => binding.set(Number(binding.value) + 1);
      },
    };
  }) satisfies ComponentFactory,
});

const Probe = defineComponent({
  name: 'Probe',
  description: 'Shows a number.',
  props: z.object({ n: z.number() }),
  component: ((ctx) => {
    void ctx;
    const el = document.createElement('output');
    return { el, update: ({ n }) => { el.textContent = String(n); } };
  }) satisfies ComponentFactory,
});

const Series = defineComponent({
  name: 'Series',
  description: 'Shows how many points a function returned.',
  props: z.object({ points: z.array(z.number()) }),
  component: (() => {
    const el = document.createElement('span');
    el.className = 'series';
    return { el, update: ({ points }) => { el.textContent = JSON.stringify(points); } };
  }) satisfies ComponentFactory,
});

const Stack = defineComponent({
  name: 'Stack',
  description: 'Layout.',
  props: z.object({ children: z.array(z.union([Knob.ref, Probe.ref, Series.ref])) }),
  component: ((ctx) => {
    const el = document.createElement('div');
    return { el, update: ({ children }) => ctx.renderChildren(el, children) };
  }) satisfies ComponentFactory,
});

const Multiples = defineFunction({
  name: 'Multiples',
  description: 'The first n multiples of k.',
  params: z.object({ k: z.number(), n: z.number() }),
  returns: z.array(z.number()),
  fn: ({ k, n }) => Array.from({ length: n }, (_, i) => k * (i + 1)),
});

const library = createLibrary<ComponentFactory>({ components: [Stack, Knob, Probe, Series], functions: [Multiples], root: 'Stack' });

function mount() {
  const host = document.body.appendChild(document.createElement('div'));
  return { host, renderer: new OpenUIRenderer(host, library, () => undefined) };
}

const text = (host: HTMLElement, selector: string) => host.querySelector(selector)?.textContent;

afterEach(() => {
  document.body.replaceChildren();
});

describe('OpenUIRenderer state', () => {
  it('starts a bound control at the declared default and shows it elsewhere', () => {
    const { host, renderer } = mount();

    renderer.set('$k = 3\nroot = Stack([Knob($k), Probe($k)])', true);

    expect(text(host, '.knob')).toBe('3');
    expect(host.querySelector<HTMLElement>('.knob')?.dataset.bound).toBe('true');
    expect(text(host, 'output')).toBe('3');
  });

  it('redraws every reader of a variable when a control writes it, without parsing again', () => {
    const { host, renderer } = mount();
    renderer.set('$k = 3\nroot = Stack([Knob($k), Probe($k), Probe($k)])', true);
    const knob = host.querySelector<HTMLElement>('.knob')!;

    knob.click();

    expect(knob.isConnected).toBe(true);
    expect(host.querySelector('.knob')).toBe(knob);
    expect([...host.querySelectorAll('output')].map((el) => el.textContent)).toEqual(['4', '4']);
  });

  it('treats a literal in a bound slot as unbound', () => {
    const { host, renderer } = mount();

    renderer.set('root = Stack([Knob(7)])', true);

    expect(host.querySelector<HTMLElement>('.knob')?.dataset.bound).toBe('false');
    expect(text(host, '.knob')).toBe('7');
  });

  it('keeps what the student set when later chunks repeat the declaration', () => {
    const { host, renderer } = mount();
    const program = '$k = 3\nroot = Stack([Knob($k), Probe($k)])';
    renderer.set(program.slice(0, 20));
    renderer.set(program, true);
    host.querySelector<HTMLElement>('.knob')!.click();

    renderer.set(program, true);

    expect(text(host, 'output')).toBe('4');
  });

  it('follows a changed default until the student touches the variable', () => {
    const { host, renderer } = mount();
    renderer.set('$k = 3\nroot = Stack([Probe($k)])', true);

    renderer.set('$k = 5\nroot = Stack([Probe($k)])', true);

    expect(text(host, 'output')).toBe('5');
  });

  it('recomputes a library function when a variable it reads changes', () => {
    const { host, renderer } = mount();
    renderer.set('$k = 2\nroot = Stack([Knob($k), Series(@Multiples($k, 3))])', true);
    expect(text(host, '.series')).toBe('[2,4,6]');

    host.querySelector<HTMLElement>('.knob')!.click();

    expect(text(host, '.series')).toBe('[3,6,9]');
  });

  it('gives each renderer its own variables', () => {
    const first = mount();
    const second = mount();
    first.renderer.set('$k = 1\nroot = Stack([Knob($k), Probe($k)])', true);
    second.renderer.set('$k = 1\nroot = Stack([Knob($k), Probe($k)])', true);

    first.host.querySelector<HTMLElement>('.knob')!.click();

    expect(text(first.host, 'output')).toBe('2');
    expect(text(second.host, 'output')).toBe('1');
  });

  it('stops redrawing and destroys components once the renderer is destroyed', () => {
    const { host, renderer } = mount();
    renderer.set('$k = 3\nroot = Stack([Knob($k), Probe($k)])', true);
    const knob = host.querySelector<HTMLElement>('.knob')!;

    renderer.destroy();
    knob.click();

    expect(host.children).toHaveLength(0);
  });
});
