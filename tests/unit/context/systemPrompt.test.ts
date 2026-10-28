import { buildSystemPrompt } from '@/context/systemPrompt';
import { loadPackTool } from '@/tools/LoadPackTool';
import { library } from '@/renderer/openui/library';
import { PACK_NAMES, PACKS } from '@/renderer/openui/packs';

const inPacks = new Set<string>(PACK_NAMES.flatMap((name) => [...PACKS[name].components, ...PACKS[name].functions]));

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt();

  it('lists each component outside the packs with its signature', () => {
    for (const [name, component] of Object.entries(library.toSpec().components)) {
      if (inPacks.has(name)) continue;
      expect(prompt).toContain(component.signature);
    }
  });

  it('leaves the packs out and names them, with the tool that loads them', () => {
    for (const name of PACK_NAMES) {
      expect(prompt).toContain(`${name} (${PACKS[name].summary})`);
      for (const component of PACKS[name].components) expect(prompt).not.toContain(library.toSpec().components[component]!.signature);
      for (const fn of PACKS[name].functions) expect(prompt).not.toContain(library.toSpec().functions![fn]!.signature);
    }
    expect(prompt).toContain(`call the ${loadPackTool.name} tool`);
  });

  it('lists every component and function when there is no tool to load them with', () => {
    const everything = buildSystemPrompt(false);

    for (const component of Object.values(library.toSpec().components)) expect(everything).toContain(component.signature);
    for (const fn of Object.values(library.toSpec().functions ?? {})) expect(everything).toContain(fn.signature);
    expect(everything).not.toContain('load_pack');
  });

  it('stays under the budget with the packs out', () => {
    expect(prompt.length).toBeLessThan(9500);
  });
});
