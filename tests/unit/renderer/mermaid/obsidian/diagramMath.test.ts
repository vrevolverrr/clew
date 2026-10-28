/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'fs';
import { renderMath } from 'obsidian';
import * as path from 'path';
import type * as Pele from 'pele';

import { diagramMath } from '@/renderer/mermaid/obsidian/diagramMath';

jest.mock('obsidian', () => ({ renderMath: jest.fn() }), { virtual: true });

// Pele is ESM only; the global build is the script Obsidian ships and Clew loads.
// The script is strict, so its top-level `var pele` stays local to eval; a script tag would make it global.
window.eval(`${readFileSync(path.join(process.cwd(), 'node_modules/pele/dist/pele.global.js'), 'utf8')};window.pele = pele;`);
const { render } = (window as unknown as { pele: typeof Pele }).pele;

const FORMULA = '<mjx-container><svg viewBox="0 0 10 5"><path d="M0 0"/></svg></mjx-container>';

/** jsdom does no layout, so the formula's measured box is set by hand. */
function drawsFormulaAs(width: number, height: number): void {
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width, height } as DOMRect);
  (renderMath as jest.Mock).mockImplementation(() => {
    const holder = document.createElement('div');
    holder.innerHTML = FORMULA;
    return holder.firstElementChild;
  });
}

beforeEach(() => {
  // jsdom has no canvas, so Pele measures label text with its own estimate.
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
  (renderMath as jest.Mock).mockReset();
  document.body.replaceChildren();
});

describe('diagramMath', () => {
  it('hands Pele the formula as sized SVG markup', () => {
    drawsFormulaAs(30, 14);

    const markup = diagramMath('x^2', 14);

    expect(markup).toMatchObject({ width: 30, height: 14 });
    expect(markup).toMatchObject({ svg: expect.stringContaining('width="30"') });
  });

  it('draws the formula at the label font size, and leaves nothing in the page', () => {
    drawsFormulaAs(30, 14);
    let fontSize = '';
    (renderMath as jest.Mock).mockImplementation(() => {
      fontSize = document.body.querySelector('div')!.style.fontSize;
      const holder = document.createElement('div');
      holder.innerHTML = FORMULA;
      return holder.firstElementChild;
    });

    diagramMath('x^2', 18);

    expect(fontSize).toBe('18px');
    expect(document.body.children).toHaveLength(0);
  });

  /** Makes MathJax answer with `svg`, sized 30 by 14. */
  function drawsSvg(svg: string): void {
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 30, height: 14 } as DOMRect);
    (renderMath as jest.Mock).mockImplementation(() => {
      const holder = document.createElement('div');
      holder.innerHTML = `<mjx-container>${svg}</mjx-container>`;
      return holder.firstElementChild;
    });
  }

  it.each([
    ['a link', '<svg viewBox="0 0 10 5"><a href="https://example.com"><path d="M0 0"/></a></svg>'],
    ['a script', '<svg viewBox="0 0 10 5"><script>alert(1)</script></svg>'],
    ['an image', '<svg viewBox="0 0 10 5"><image href="https://example.com/x.png"/></svg>'],
    ['a style element', '<svg viewBox="0 0 10 5"><style>path { fill: url(https://example.com/x) }</style><path d="M0 0"/></svg>'],
    ['embedded HTML', '<svg viewBox="0 0 10 5"><foreignObject><div>x</div></foreignObject></svg>'],
    ['a paint from elsewhere', '<svg viewBox="0 0 10 5"><path d="M0 0" fill="url(https://example.com/x#p)"/></svg>'],
    ['a glyph from elsewhere', '<svg viewBox="0 0 10 5"><use href="https://example.com/x.svg#g"/></svg>'],
  ])('leaves the span as text when the formula carries %s', (_, svg) => {
    drawsSvg(svg);

    expect(diagramMath('\\href{https://example.com}{x}', 14)).toBeNull();
  });

  it('drops styles, classes and event handlers, and keeps the drawing and its own glyph references', () => {
    drawsSvg('<svg viewBox="0 0 10 5" style="vertical-align: -1ex" onload="alert(1)"><defs><path id="MJX-1-TEX-N-78" d="M1 1"/></defs>'
      + '<g class="evil" style="position: fixed" fill="currentColor"><use xlink:href="#MJX-1-TEX-N-78" onclick="alert(1)"/></g></svg>');

    const markup = diagramMath('x', 14) as { svg: string };

    expect(markup.svg).toContain('id="MJX-1-TEX-N-78"');
    expect(markup.svg).toContain('xlink:href="#MJX-1-TEX-N-78"');
    expect(markup.svg).toContain('fill="currentColor"');
    expect(markup.svg).not.toMatch(/style|class|onload|onclick/);
  });

  it('drops an id that is not one of the formula\'s own', () => {
    drawsSvg('<svg viewBox="0 0 10 5"><path id="app-header" d="M0 0"/></svg>');

    expect((diagramMath('x', 14) as { svg: string }).svg).not.toContain('app-header');
  });

  it('leaves the span as text when the formula has no size or the engine fails', () => {
    drawsFormulaAs(0, 0);
    expect(diagramMath('x^2', 14)).toBeNull();

    (renderMath as jest.Mock).mockImplementation(() => {
      throw new Error('MathJax is not loaded');
    });
    expect(diagramMath('x^2', 14)).toBeNull();
    expect(document.body.children).toHaveLength(0);
  });
});

describe('a diagram drawn by Pele with diagramMath', () => {
  it('shows the formula in a label and no dollar signs', () => {
    drawsFormulaAs(30, 14);

    const { svg } = render('flowchart LR\n  A["Variance $$\\sigma^2$$"] --> B[Next]', { math: diagramMath });

    expect(svg).toContain('<path d="M0 0"');
    expect(svg).not.toContain('$$');
  });
});
