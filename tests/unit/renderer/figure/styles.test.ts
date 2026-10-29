import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TAGS } from '@/renderer/figure/FigureData';

const css = readFileSync(path.join(__dirname, '../../../../styles.css'), 'utf8');
const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim());
const SURFACES = ['clew-figure-node', 'clew-network-node', 'clew-figure-cell', 'clew-figure-seq-cell', 'clew-network-edge', 'clew-network-edge-label', 'clew-figure-link', 'clew-figure-pointer', 'clew-figure-key-mark'];

describe('figure tag styles', () => {
  it.each(TAGS.flatMap((tag) => SURFACES.map((surface) => [tag, surface] as const)))('styles %s on %s', (tag, surface) => {
    const surfaceAt = new RegExp(`\\.${surface}(?![\\w-])`);
    expect(selectors.some((selector) => selector.includes(`[data-tag='${tag}']`) && surfaceAt.test(selector))).toBe(true);
  });

  it('never styles a bare [data-tag] for every surface', () => {
    const bare = selectors.flatMap((selector) => selector.split(',')).map((part) => part.trim()).filter((part) => /(^|\s|>)\[data-tag/.test(part));
    expect(bare).toEqual([]);
  });
});
