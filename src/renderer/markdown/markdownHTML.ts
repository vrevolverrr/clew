import { transformMarkdownSegments } from '@/renderer/markdown/markdownSegments';

/** Escapes HTML special characters for safe insertion into rendered markup. */
export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escapes message-authored raw HTML before Obsidian's MarkdownRenderer sees it.
 *
 * This runs *before* trusted HTML injection points such as image embeds, so
 * user text like `<meta-name>` renders as plain text while intentional plugin
 * markup can still be inserted afterward.
 */
export function escapeRawHTMLTags(markdown: string): string {
  if (!markdown.includes('<')) {
    return markdown;
  }

  return transformMarkdownSegments(markdown, { rawHtml: escapeHTML });
}
