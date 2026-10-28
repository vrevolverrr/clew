import { loadPackTool } from '@/tools/LoadPackTool';
import { library } from '@/renderer/openui/library';
import { PACK_NAMES, PACKS } from '@/renderer/openui/packs';

describe('loadPackTool', () => {
  it('loads the complete Board and Network contracts, with shared Step syntax and examples', () => {
    expect(loadPackTool.run('board')).toContain('A >> place');
    expect(loadPackTool.run('board')).toContain('Reading from disk or another persistent store uses copies');
    expect(loadPackTool.run('network')).toContain('Opposite edges, parallel edges and self-loops');
    for (const name of ['board', 'network'] as const) expect(loadPackTool.run(name)).toContain('Step(');
  });
  it('names a pack only if the library has every component and function in it', () => {
    const spec = library.toSpec();
    for (const name of PACK_NAMES) {
      for (const component of PACKS[name].components) expect(spec.components[component]).toBeDefined();
      for (const fn of PACKS[name].functions) expect(spec.functions?.[fn]).toBeDefined();
    }
  });

  it('returns the signature of every component and function of a pack', () => {
    const spec = library.toSpec();
    const text = loadPackTool.run('plot');

    for (const component of PACKS.plot.components) expect(text).toContain(spec.components[component]!.signature);
    for (const fn of PACKS.plot.functions) expect(text).toContain(spec.functions![fn]!.signature);
    expect(text).toContain('@Name(args)');
  });

  it('says so, and lists the packs, when asked for one that does not exist', () => {
    expect(loadPackTool.run('graphs')).toBe(`No pack named graphs. Packs: ${PACK_NAMES.join(', ')}.`);
  });

  it('titles the call by the pack it loaded', () => {
    expect(loadPackTool.title('plot')).toBe('Loaded the plot visuals');
  });
});
