import type { App, TFile } from 'obsidian';

import { replaceImageEmbedsWithHTML } from '@/renderer/markdown/obsidian/imageEmbed';

type LinkResolver = (
  linkPath: string,
  sourcePath: string,
  files: Map<string, TFile>
) => TFile | null | undefined;

// Mock App and vault for testing
function createMockApp(files: Map<string, string> = new Map(), resolveLink?: LinkResolver): App {
  const mockFiles = new Map<string, TFile>();
  files.forEach((_resourcePath, filePath) => {
    mockFiles.set(filePath, {
      path: filePath,
      basename: filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || filePath,
    } as TFile);
  });

  return {
    vault: {
      getAbstractFileByPath: (path: string) => mockFiles.get(path) || null,
      getResourcePath: (file: TFile) => files.get(file.path) || `app://local/${file.path}`,
    },
    metadataCache: {
      getFirstLinkpathDest: (linkPath: string, sourcePath: string) => {
        const resolved = resolveLink?.(linkPath, sourcePath, mockFiles);
        if (resolved !== undefined) {
          return resolved;
        }

        // Try to find by basename
        for (const [path, file] of mockFiles) {
          if (path.endsWith(linkPath) || path === linkPath) {
            return file;
          }
        }
        return null;
      },
    },
  } as unknown as App;
}

describe('replaceImageEmbedsWithHTML', () => {
  describe('basic image embeds', () => {
    it('replaces image embeds in text but preserves image embed syntax in inline code', () => {
      const app = createMockApp(new Map([
        ['visible.png', 'app://local/visible.png'],
        ['literal.png', 'app://local/literal.png'],
      ]));

      const result = replaceImageEmbedsWithHTML(
        'Visible ![[visible.png]] and `literal ![[literal.png]]`',
        app
      );

      expect(result).toBe(
        'Visible <span class="clew-embedded-image"><img src="app://local/visible.png" alt="visible" loading="lazy"></span> and `literal ![[literal.png]]`'
      );
    });
  });

  describe('code syntax', () => {
    it('preserves image embed syntax in backtick and tilde fences', () => {
      const app = createMockApp(new Map([
        ['visible.png', 'app://local/visible.png'],
        ['backtick.png', 'app://local/backtick.png'],
        ['tilde.png', 'app://local/tilde.png'],
      ]));
      const markdown = [
        '![[visible.png]]',
        '',
        '```md',
        '![[backtick.png]]',
        '```',
        '',
        '~~~md',
        '![[tilde.png]]',
        '~~~',
      ].join('\n');

      const result = replaceImageEmbedsWithHTML(markdown, app);

      expect(result).toContain('src="app://local/visible.png"');
      expect(result).toContain('```md\n![[backtick.png]]\n```');
      expect(result).toContain('~~~md\n![[tilde.png]]\n~~~');
      expect(result).not.toContain('src="app://local/backtick.png"');
      expect(result).not.toContain('src="app://local/tilde.png"');
    });

    it('preserves image embed syntax in indented code', () => {
      const app = createMockApp(new Map([
        ['visible.png', 'app://local/visible.png'],
        ['literal.png', 'app://local/literal.png'],
      ]));

      const result = replaceImageEmbedsWithHTML(
        '![[visible.png]]\n\n    ![[literal.png]]',
        app
      );

      expect(result).toContain('src="app://local/visible.png"');
      expect(result).toContain('\n\n    ![[literal.png]]');
      expect(result).not.toContain('src="app://local/literal.png"');
    });
  });

  describe('alt text and dimensions', () => {
    it('uses alt text from wikilink', () => {
      const app = createMockApp(new Map([['image.png', 'app://local/image.png']]));
      const result = replaceImageEmbedsWithHTML('![[image.png|My Alt Text]]', app);

      expect(result).toContain('alt="My Alt Text"');
    });

    it('applies width dimension from alt text', () => {
      const app = createMockApp(new Map([['image.png', 'app://local/image.png']]));
      const result = replaceImageEmbedsWithHTML('![[image.png|300]]', app);

      expect(result).toContain('style="width: 300px;"');
    });

    it('applies width and height dimensions', () => {
      const app = createMockApp(new Map([['image.png', 'app://local/image.png']]));
      const result = replaceImageEmbedsWithHTML('![[image.png|200x150]]', app);

      expect(result).toContain('style="width: 200px; height: 150px;"');
    });

    it('uses basename as alt when no alt text provided', () => {
      const app = createMockApp(new Map([['folder/my-image.png', 'app://local/folder/my-image.png']]));
      const result = replaceImageEmbedsWithHTML('![[folder/my-image.png]]', app);

      expect(result).toContain('alt="my-image"');
    });
  });

  describe('supported image extensions', () => {
    it('handles uppercase extensions (case-insensitive)', () => {
      const app = createMockApp(new Map([['photo.PNG', 'app://local/photo.PNG']]));
      const result = replaceImageEmbedsWithHTML('![[photo.PNG]]', app);

      expect(result).toContain('<img');
    });
  });

  describe('non-image embeds (should pass through)', () => {
    it('leaves markdown file embed unchanged', () => {
      const app = createMockApp();
      const result = replaceImageEmbedsWithHTML('![[note.md]]', app);

      expect(result).toBe('![[note.md]]');
    });

    it('processes only image embeds in mixed content', () => {
      const app = createMockApp(new Map([['image.png', 'app://local/image.png']]));
      const result = replaceImageEmbedsWithHTML('![[note.md]] and ![[image.png]]', app);

      expect(result).toContain('![[note.md]]');
      expect(result).toContain('<img');
    });
  });

  describe('file not found (fallback)', () => {
    it('shows fallback when image file not found', () => {
      const app = createMockApp(); // Empty vault
      const result = replaceImageEmbedsWithHTML('![[missing.png]]', app);

      expect(result).toContain('class="clew-embedded-image-fallback"');
      expect(result).toContain('![[missing.png]]');
    });

    it('escapes HTML in fallback wikilink', () => {
      const app = createMockApp();
      const result = replaceImageEmbedsWithHTML('![[<script>alert(1)</script>.png]]', app);

      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });
  });

  describe('source path resolution', () => {
    it('passes source path into Obsidian link resolution for ambiguous image embeds', () => {
      const app = createMockApp(
        new Map([
          ['section-a/image.png', 'app://local/section-a/image.png'],
          ['section-b/image.png', 'app://local/section-b/image.png'],
        ]),
        (linkPath, sourcePath, files) => {
          if (linkPath === 'image.png' && sourcePath === 'section-b/note.md') {
            return files.get('section-b/image.png');
          }
          return files.get('section-a/image.png');
        }
      );

      const result = replaceImageEmbedsWithHTML('![[image.png]]', app, 'section-b/note.md');

      expect(result).toContain('src="app://local/section-b/image.png"');
      expect(result).not.toContain('section-a/image.png');
    });

    it('falls back to the direct vault path when native resolution misses for a note source path', () => {
      const app = createMockApp(
        new Map([['image.png', 'app://local/image.png']]),
        () => null
      );

      const result = replaceImageEmbedsWithHTML('![[image.png]]', app, 'note.md');

      expect(result).toContain('src="app://local/image.png"');
    });

    it('preserves the vault-root hit when source path is blank', () => {
      const app = createMockApp(
        new Map([
          ['image.png', 'app://local/image.png'],
          ['section/image.png', 'app://local/section/image.png'],
        ]),
        (linkPath, _sourcePath, files) =>
          linkPath === 'image.png' ? files.get('image.png') ?? null : null
      );

      const result = replaceImageEmbedsWithHTML('![[image.png]]', app, '');

      expect(result).toContain('src="app://local/image.png"');
      expect(result).not.toContain('app://local/section/image.png');
    });

    it('falls back to native resolution when source path is blank and the direct path misses', () => {
      const app = createMockApp(
        new Map([['section/image.png', 'app://local/section/image.png']]),
        (linkPath, sourcePath, files) =>
          linkPath === 'image.png' && sourcePath === ''
            ? files.get('section/image.png') ?? null
            : null
      );

      const result = replaceImageEmbedsWithHTML('![[image.png]]', app, '');

      expect(result).toContain('src="app://local/section/image.png"');
      expect(result).not.toContain('clew-embedded-image-fallback');
    });
  });

  describe('multiple image embeds', () => {
    it('replaces consecutive image embeds', () => {
      const app = createMockApp(
        new Map([
          ['1.png', 'app://local/1.png'],
          ['2.png', 'app://local/2.png'],
        ])
      );
      const result = replaceImageEmbedsWithHTML('![[1.png]]![[2.png]]', app);

      expect((result.match(/<img/g) || []).length).toBe(2);
    });
  });

  describe('HTML escaping (security)', () => {
    it('escapes HTML in image src', () => {
      const app = createMockApp(new Map([['test.png', 'app://local/path"><script>alert(1)</script>']]));
      const result = replaceImageEmbedsWithHTML('![[test.png]]', app);

      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('escapes HTML in alt text', () => {
      const app = createMockApp(new Map([['test.png', 'app://local/test.png']]));
      const result = replaceImageEmbedsWithHTML('![[test.png|<b>bold</b>]]', app);

      expect(result).not.toContain('<b>');
      expect(result).toContain('&lt;b&gt;');
    });
  });

  describe('edge cases', () => {
    it('handles incomplete embed syntax', () => {
      const app = createMockApp();
      const result = replaceImageEmbedsWithHTML('![[incomplete', app);

      expect(result).toBe('![[incomplete');
    });

    it('handles special characters in filename', () => {
      const filename = 'photo (2024-01-01).png';
      const app = createMockApp(new Map([[filename, `app://local/${filename}`]]));
      const result = replaceImageEmbedsWithHTML(`![[${filename}]]`, app);

      expect(result).toContain('<img');
    });

    it('handles spaces in filename', () => {
      const filename = 'my long image name.png';
      const app = createMockApp(new Map([[filename, `app://local/${filename}`]]));
      const result = replaceImageEmbedsWithHTML(`![[${filename}]]`, app);

      expect(result).toContain('<img');
    });
  });

  describe('error handling', () => {
    it('returns unchanged markdown when app is not initialized', () => {
      // @ts-expect-error - testing invalid input
      const result = replaceImageEmbedsWithHTML('![[image.png]]', null);

      expect(result).toBe('![[image.png]]');
    });

    it('returns unchanged markdown when metadataCache is missing', () => {
      const app = { vault: {} } as unknown as App;
      const result = replaceImageEmbedsWithHTML('![[image.png]]', app);

      expect(result).toBe('![[image.png]]');
    });

    it('returns fallback when getResourcePath throws', () => {
      const mockFile = { path: 'test.png', basename: 'test' } as TFile;
      const app = {
        vault: {
          getAbstractFileByPath: () => mockFile,
          getResourcePath: () => {
            throw new Error('Resource path failed');
          },
        },
        metadataCache: {
          getFirstLinkpathDest: () => null,
        },
      } as unknown as App;

      const result = replaceImageEmbedsWithHTML('![[test.png]]', app);

      expect(result).toContain('class="clew-embedded-image-fallback"');
    });
  });

  describe('regular wikilinks (should NOT match)', () => {
    it('does not replace regular wikilink', () => {
      const app = createMockApp();
      const result = replaceImageEmbedsWithHTML('[[note.md]]', app);

      expect(result).toBe('[[note.md]]');
      expect(result).not.toContain('<img');
    });
  });
});
