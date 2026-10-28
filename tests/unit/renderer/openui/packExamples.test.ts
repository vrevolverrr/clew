/**
 * @jest-environment jsdom
 */
import { loadPackTool } from '@/tools/LoadPackTool';
import { library } from '@/renderer/openui/library';
import { OpenUIRenderer } from '@/renderer/openui/OpenUIRenderer';
import { PACK_NAMES, PACKS } from '@/renderer/openui/packs';

afterEach(() => {
  jest.restoreAllMocks();
  document.body.replaceChildren();
});

describe.each(PACK_NAMES.filter((name) => 'example' in PACKS[name]))('the %s pack example', (name) => {
  const example = (PACKS[name] as { example: string }).example;

  it('parses and draws without a parse or runtime error', () => {
    const problems = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    const host = document.body.appendChild(document.createElement('div'));
    const renderer = new OpenUIRenderer(host, library, () => undefined);
    renderer.set(example, true);

    expect(renderer.errors).toEqual([]);
    expect(problems).not.toHaveBeenCalled();
    expect(host.querySelector(`.clew-${name}`)).not.toBeNull();
  });

  it('comes back from load_pack', () => {
    expect(loadPackTool.run(name)).toContain(example);
  });
});
