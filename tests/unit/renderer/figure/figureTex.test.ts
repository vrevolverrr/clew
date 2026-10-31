import { drawTex, drawTexIn, mapMath, texAnchors, texIn, texProblems, TYPESET_MATH } from '@/renderer/figure/figureTex';

const colour = (_tag: string, fill: boolean): readonly [number, number, number] => (fill ? [1, 2, 3] : [10, 20, 30]);

describe('maths spans', () => {
  const typeset = (text: string): string[] => {
    const spans: string[] = [];
    mapMath(text, (math) => (spans.push(math), math), undefined, TYPESET_MATH);
    return spans;
  };

  it('typesets inline maths as Obsidian does, so prices stay text', () => {
    expect(typeset('debits $28,200.00 equal credits $28,200.00.')).toEqual([]);
    expect(typeset('costs $5 and $10')).toEqual([]);
    expect(typeset('$x$, $a + b$ and $$\\sum x$$')).toEqual(['$x$', '$a + b$', '$$\\sum x$$']);
  });

  it('checks every span another renderer might typeset, so a check never misses one', () => {
    expect(texIn('a $ \\style{x}{y} $ b')).toEqual(['$ \\style{x}{y} $']);
    expect(texProblems('$ \\style{x}{y} $')).toBe('TeX \\style is not allowed; colour with a tag');
  });
});

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

  it.each([
    '\\bbox[background-image:url(https://x.test/p.png)]{x}',
    '\\bbox[5px,background:\\75rl(x)]{x}',
    '\\style{background:url(https://x.test/p.png)}{x}',
    '\\require{x}',
  ])('rejects TeX that could fetch: %s', (tex) => {
    expect(texProblems(tex)).toContain('is not allowed');
  });

  it('accepts a plain bbox style', () => {
    expect(texProblems('\\bbox[border:1px solid]{x}')).toBeUndefined();
  });
});

describe('drawTex', () => {
  it('writes tag colours in the forms MathJax renders and anchors as data attributes', () => {
    expect(texAnchors('\\cssId{r2}{0} + \\cssId{ r3 }{1}')).toEqual(['r2', 'r3']);
    expect(drawTex('\\rowcolor{new} \\cssId{r2}{0} & \\color{good}{x} & \\bbox[4px,bad]{y}', colour)).toBe(
      '\\rowcolor[RGB]{1,2,3} \\data{figure-id=r2}{0} & \\color[RGB]{10,20,30}{x} & \\bbox[4px,background-color:rgb(1 2 3)]{y}',
    );
  });

  it('rewrites only the maths of a Markdown string', () => {
    expect(drawTexIn('Cost \\color{good} then $\\color{good}{x}$', colour)).toBe('Cost \\color{good} then $\\color[RGB]{10,20,30}{x}$');
  });
});
