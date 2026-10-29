import { drawTex, drawTexIn, texAnchors, texProblems } from '@/renderer/figure/figureTex';

const colour = (): readonly [number, number, number] => [10, 20, 30];

describe('texProblems', () => {
  it.each([
    '\\color{good}{x}',
    '\\colorbox{new}{x}',
    '\\begin{array}{c}\\rowcolor{active} x\\end{array}',
    '\\begin{array}{c}\\cellcolor{match} x\\end{array}',
    '\\bbox[bad]{x}',
    '\\bbox[5px,dim]{x}',
  ])('accepts a tag colour in %s', (tex) => {
    expect(texProblems(tex)).toBeUndefined();
  });

  it.each(['red', '#d0453a', 'rgb(1,2,3)'])('rejects the colour %s', (name) => {
    expect(texProblems(`\\color{${name}}{x}`)).toContain('is not a tag; use one of active, done, match, new, dim, good, bad');
  });

  it('rejects a colour model, a non-tag box colour and the host-only commands', () => {
    expect(texProblems('\\color[RGB]{1,2,3}{x}')).toContain('is not a tag');
    expect(texProblems('\\bbox[red]{x}')).toBe('TeX colour "red" is not a tag; use one of active, done, match, new, dim, good, bad');
    expect(texProblems('\\definecolor{c}{RGB}{1,2,3}')).toContain('\\definecolor is not allowed');
    expect(texProblems('\\class{x}{y}')).toContain('\\class is the host');
    expect(texProblems('\\data{x=1}{y}')).toContain('\\data is the host');
  });
});

describe('drawTex', () => {
  it('writes tag colours in the forms MathJax renders and anchors as data attributes', () => {
    expect(texAnchors('\\cssId{r2}{0} + \\cssId{ r3 }{1}')).toEqual(['r2', 'r3']);
    expect(drawTex('\\rowcolor{new} \\cssId{r2}{0} & \\color{good}{x} & \\bbox[4px,bad]{y}', colour)).toBe(
      '\\rowcolor[RGB]{10,20,30} \\data{figure-id=r2}{0} & \\color[RGB]{10,20,30}{x} & \\bbox[4px,background-color:rgb(10 20 30)]{y}',
    );
  });

  it('rewrites only the maths of a Markdown string', () => {
    expect(drawTexIn('Cost \\color{good} then $\\color{good}{x}$', colour)).toBe('Cost \\color{good} then $\\color[RGB]{10,20,30}{x}$');
  });
});
