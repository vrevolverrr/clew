import { escapeHTML, escapeModelMarkdown } from '@/renderer/markdown/markdownHTML';

describe('markdownHtml', () => {
  describe('escapeModelMarkdown', () => {
    it('escapes placeholder-style tags and raw HTML exactly', () => {
      expect(
        escapeModelMarkdown('Use <meta-name> and <span title="A&B">value</span>.')
      ).toBe(
        'Use &lt;meta-name&gt; and &lt;span title=&quot;A&amp;B&quot;&gt;value&lt;/span&gt;.'
      );
    });

    it('preserves inline, fenced, and indented code', () => {
      const markdown = [
        '`<meta-name>` and <meta-name>',
        '```html',
        '<my-component>',
        '```',
        '    <indented-code>',
      ].join('\n');

      expect(escapeModelMarkdown(markdown)).toBe([
        '`<meta-name>` and &lt;meta-name&gt;',
        '```html',
        '<my-component>',
        '```',
        '    <indented-code>',
      ].join('\n'));
    });

    it('preserves blockquoted and list-nested fences and multiline code spans', () => {
      const markdown = [
        '> ```html',
        '> <blockquote-code>',
        '> ```',
        '- ```html',
        '  <list-code>',
        '  ```',
        '- > ~~~html',
        '  > <nested-code>',
        '  > ~~~',
        '10. ~~~html',
        '    <ordered-list-code>',
        '    ~~~',
        '<after-list>',
        '10. Item',
        '',
        '    ~~~html',
        '    <continued-list-code>',
        '    ~~~',
        '<after-continued-list>',
        '`multiline code',
        '<inline-code>` and <placeholder>',
      ].join('\n');

      expect(escapeModelMarkdown(markdown)).toBe([
        '> ```html',
        '> <blockquote-code>',
        '> ```',
        '- ```html',
        '  <list-code>',
        '  ```',
        '- > ~~~html',
        '  > <nested-code>',
        '  > ~~~',
        '10. ~~~html',
        '    <ordered-list-code>',
        '    ~~~',
        '&lt;after-list&gt;',
        '10. Item',
        '',
        '    ~~~html',
        '    <continued-list-code>',
        '    ~~~',
        '&lt;after-continued-list&gt;',
        '`multiline code',
        '<inline-code>` and &lt;placeholder&gt;',
      ].join('\n'));
    });

    it('does not close a root fence on container-like code lines', () => {
      const markdown = [
        '```markdown',
        '- ```',
        '> ```',
        '<inside-code>',
        '```',
        '<after-code>',
      ].join('\n');

      expect(escapeModelMarkdown(markdown)).toBe([
        '```markdown',
        '- ```',
        '> ```',
        '<inside-code>',
        '```',
        '&lt;after-code&gt;',
      ].join('\n'));
    });

    it('does not match multiline code spans across blank-line block boundaries', () => {
      const markdown = [
        'unmatched `',
        '',
        '<meta-name>',
        '',
        '`later',
      ].join('\n');

      expect(escapeModelMarkdown(markdown)).toBe([
        'unmatched `',
        '',
        '&lt;meta-name&gt;',
        '',
        '`later',
      ].join('\n'));

      const headingBoundary = [
        'unmatched `',
        '# Heading',
        '<meta-name>',
        '`later',
      ].join('\n');
      expect(escapeModelMarkdown(headingBoundary)).toBe([
        'unmatched `',
        '# Heading',
        '&lt;meta-name&gt;',
        '`later',
      ].join('\n'));
    });

    it('does not match multiline inline spans across container boundaries', () => {
      const markdown = [
        'unmatched `',
        '- <list-placeholder>`',
        'unmatched `',
        '> <quote-placeholder>`',
        'unmatched $x',
        '- <math-list-placeholder>$',
        'unmatched $x',
        '> <math-quote-placeholder>$',
      ].join('\n');

      expect(escapeModelMarkdown(markdown)).toBe([
        'unmatched `',
        '- &lt;list-placeholder&gt;`',
        'unmatched `',
        '> &lt;quote-placeholder&gt;`',
        'unmatched $x',
        '- &lt;math-list-placeholder&gt;$',
        'unmatched $x',
        '> &lt;math-quote-placeholder&gt;$',
      ].join('\n'));
    });

    it('preserves multiline code spans within the same container paragraph', () => {
      const markdown = [
        '- `list code',
        '  <inside-list>` and <after-list>',
        '> `quote code',
        '> <inside-quote>` and <after-quote>',
        '- > `nested code',
        '  > <inside-nested>` and <after-nested>',
      ].join('\n');

      expect(escapeModelMarkdown(markdown)).toBe([
        '- `list code',
        '  <inside-list>` and &lt;after-list&gt;',
        '> `quote code',
        '> <inside-quote>` and &lt;after-quote&gt;',
        '- > `nested code',
        '  > <inside-nested>` and &lt;after-nested&gt;',
      ].join('\n'));
    });

    it.each([
      ['preserves angle comparisons inside inline and display math', '$x<y$ and $a>b$.\n$$c<d \\land d>e$$', '$x<y$ and $a>b$.\n$$c<d \\land d>e$$'],
      ['escapes HTML between dollar amounts', 'Prices are $5 <meta-name> and $10.', 'Prices are $5 &lt;meta-name&gt; and $10.'],
      ['escapes HTML in math opened by a space', '$ x<meta-name>$', '$ x&lt;meta-name&gt;$'],
      ['escapes HTML in math closed after a space', '$x<meta-name> $', '$x&lt;meta-name&gt; $'],
      ['escapes HTML in math closed before a digit', '$x<meta-name>$10', '$x&lt;meta-name&gt;$10'],
      ['preserves backslash-escaped HTML-like text', String.raw`\<meta-name\> and <name>`, String.raw`\<meta-name\> and &lt;name&gt;`],
      ['preserves backslash-escaped backticks around HTML-like text', '\\`<name>\\`', '\\`&lt;name&gt;\\`'],
      ['preserves URI and email autolinks', '<https://example.com/a> <user@example.com> <placeholder>', '<https://example.com/a> <user@example.com> &lt;placeholder&gt;'],
      ['preserves image wikilinks for later embed processing', '![[<image-name>.png|<alt>]]', '![[<image-name>.png|<alt>]]'],
    ])('%s', (_name, markdown, expected) => {
      expect(escapeModelMarkdown(markdown)).toBe(expected);
    });

    it('escapes multiline HTML constructs and declarations', () => {
      const markdown = [
        '<!--',
        '<comment-body>',
        '-->',
        '<span',
        ' title="A&B">',
        'value',
        '</span>',
        '<!DOCTYPE html>',
        '<!doctype html>',
      ].join('\n');

      expect(escapeModelMarkdown(markdown)).toBe([
        '&lt;!--',
        '&lt;comment-body&gt;',
        '--&gt;',
        '&lt;span',
        ' title=&quot;A&amp;B&quot;&gt;',
        'value',
        '&lt;/span&gt;',
        '&lt;!DOCTYPE html&gt;',
        '&lt;!doctype html&gt;',
      ].join('\n'));
    });

    it.each([
      ['comment', '<!--\n<meta-name>'],
      ['processing instruction', '<?target\n<meta-name>'],
    ])('escapes an unclosed HTML %s through EOF', (_kind, markdown) => {
      expect(escapeModelMarkdown(markdown)).toBe(escapeHTML(markdown));
    });

    it('distinguishes paragraph continuation indentation from indented code', () => {
      const markdown = [
        'Use:',
        '    <paragraph-placeholder>',
        '',
        '    <root-code>',
        '',
        '>     <quote-code>',
        '',
        '> Use:',
        '>     <quote-paragraph-placeholder>',
        '',
        '- Use:',
        '      <list-paragraph-placeholder>',
        '',
        '      <list-code>',
        '',
        '# Heading',
        '    <heading-code>',
        '',
        '<!-- closed -->',
        '    <html-following-code>',
      ].join('\n');

      expect(escapeModelMarkdown(markdown)).toBe([
        'Use:',
        '    &lt;paragraph-placeholder&gt;',
        '',
        '    <root-code>',
        '',
        '>     <quote-code>',
        '',
        '> Use:',
        '>     &lt;quote-paragraph-placeholder&gt;',
        '',
        '- Use:',
        '      &lt;list-paragraph-placeholder&gt;',
        '',
        '      <list-code>',
        '',
        '# Heading',
        '    <heading-code>',
        '',
        '&lt;!-- closed --&gt;',
        '    <html-following-code>',
      ].join('\n'));
    });
  });

  describe('escapeHTML', () => {
    it('escapes HTML special characters', () => {
      expect(escapeHTML('<script>alert("x&y")</script>')).toBe(
        '&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;'
      );
    });
  });

  describe('images', () => {
    it('turns inline, reference and nested images into links and keeps vault embeds and code', () => {
      expect(escapeModelMarkdown('![a](https://x.test/a.png) ![b][r] ![[x.png]] `![c](u)`\n\n[r]: https://x.test/b.png'))
        .toBe('[a](https://x.test/a.png) [b][r] ![[x.png]] `![c](u)`\n\n[r]: https://x.test/b.png');
      expect(escapeModelMarkdown('![[x](y)](https://x.test/c.png)')).toBe('[[x](y)](https://x.test/c.png)');
      expect(escapeModelMarkdown('![[x](y)](https://x.test/c.png) ![[x.png]]')).toBe('[[x](y)](https://x.test/c.png) ![[x.png]]');
      expect(escapeModelMarkdown('![[x](y)](u) <img src=x onerror=alert(1)> ]]')).toBe('[[x](y)](u) &lt;img src=x onerror=alert(1)&gt; ]]');
    });

    it('keeps an escaped bang, and rewrites one after an escaped backslash', () => {
      expect(escapeModelMarkdown('\\![d](u) \\\\![e](https://x.test/e.png)')).toBe('\\![d](u) \\\\[e](https://x.test/e.png)');
    });

    it('keeps a factorial in maths, unless a link could follow or the reply defines reference links', () => {
      expect(escapeModelMarkdown('$n![x^n]F(x)$ and $$k![t^k]G$$')).toBe('$n![x^n]F(x)$ and $$k![t^k]G$$');
      expect(escapeModelMarkdown('$$\n\n![a](https://x.test/a.png)')).toBe('$$\n\n[a](https://x.test/a.png)');
      expect(escapeModelMarkdown('$$ n![a](https://x.test/a.png)')).toBe('$$ n[a](https://x.test/a.png)');
      expect(escapeModelMarkdown('$$ n![a]\n\n[a]: https://x.test/a.png')).toBe('$$ n[a]\n\n[a]: https://x.test/a.png');
    });

    it('escapes an unclosed CDATA section through EOF, dropping its bang like any other', () => {
      expect(escapeModelMarkdown('<![CDATA[\n<meta-name>')).toBe('&lt;[CDATA[\n&lt;meta-name&gt;');
    });

    it('rewrites an image inside escaped raw HTML and inside a link destination', () => {
      expect(escapeModelMarkdown('<div>![a](https://x.test/a.png)</div> <b>![foo]</b>')).toBe('&lt;div&gt;[a](https://x.test/a.png)&lt;/div&gt; &lt;b&gt;[foo]&lt;/b&gt;');
      expect(escapeModelMarkdown('[a](u ![b](https://x.test/b.png))')).toBe('[a](u [b](https://x.test/b.png))');
    });
  });
});
