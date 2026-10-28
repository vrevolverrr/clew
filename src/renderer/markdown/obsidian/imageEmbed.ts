/**
 * Replaces Obsidian image embeds ![[image.png]] with HTML <img> tags
 * before MarkdownRenderer processes the content.
 *
 * Note: This is display-only - the agent still receives the wikilink text.
 */

import type { App, TFile } from 'obsidian';

import { escapeHTML } from '@/renderer/markdown/markdownHTML';
import { transformMarkdownSegments } from '@/renderer/markdown/markdownSegments';

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
]);

const IMAGE_EMBED_PATTERN = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function getVaultFileByPath(app: App, filePath: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(filePath);
  return isVaultFile(file) ? file : null;
}

function isVaultFile(value: unknown): value is TFile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TFile>;
  return typeof candidate.path === 'string'
    && typeof candidate.basename === 'string';
}

function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}

function resolveImageFile(app: App, imagePath: string, sourcePath: string): TFile | null {
  // With a note context, resolve the embed through Obsidian's note-relative link resolution first.
  if (sourcePath) {
    const resolved = app.metadataCache.getFirstLinkpathDest(imagePath, sourcePath);
    if (resolved) return resolved;
  }

  const file = getVaultFileByPath(app, imagePath);
  if (file) return file;

  if (sourcePath) return null;

  return app.metadataCache.getFirstLinkpathDest(imagePath, sourcePath);
}

/** Supports formats: "100" (width only) or "100x200" (width x height) */
function buildStyleAttribute(altText: string | undefined): string {
  if (!altText) return '';

  const dimMatch = altText.match(/^(\d+)(?:x(\d+))?$/);
  if (!dimMatch) return '';

  const width = dimMatch[1];
  const height = dimMatch[2];

  if (height) {
    return ` style="width: ${width}px; height: ${height}px;"`;
  }
  return ` style="width: ${width}px;"`;
}

function createImageHTML(
  app: App,
  file: TFile,
  altText: string | undefined
): string {
  const src = app.vault.getResourcePath(file);
  const alt = escapeHTML(altText || file.basename);
  const style = buildStyleAttribute(altText);

  return `<span class="clew-embedded-image"><img src="${escapeHTML(src)}" alt="${alt}" loading="lazy"${style}></span>`;
}

function createFallbackHTML(wikilink: string): string {
  return `<span class="clew-embedded-image-fallback">${escapeHTML(wikilink)}</span>`;
}

/**
 * Call before MarkdownRenderer.render().
 * Non-image embeds (e.g., ![[note.md]]) pass through unchanged.
 */
export function replaceImageEmbedsWithHTML(
  markdown: string,
  app: App,
  sourcePath = ''
): string {
  if (!app?.vault || !app?.metadataCache) {
    return markdown;
  }

  // Reset lastIndex to avoid issues with global regex
  IMAGE_EMBED_PATTERN.lastIndex = 0;

  return transformMarkdownSegments(markdown, {
    wikilink: (wikilink, { embedded }) => {
      if (!embedded) {
        return wikilink;
      }

      return wikilink.replace(
        IMAGE_EMBED_PATTERN,
        (match, imagePath: string, altText: string | undefined) => {
          try {
            if (!isImagePath(imagePath)) {
              return match;
            }

            const file = resolveImageFile(app, imagePath, sourcePath);
            if (!file) {
              return createFallbackHTML(match);
            }

            return createImageHTML(app, file, altText);
          } catch {
            return createFallbackHTML(match);
          }
        }
      );
    },
  });
}
