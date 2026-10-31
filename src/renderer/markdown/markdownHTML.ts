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
 * Makes message-authored Markdown safe for Obsidian's MarkdownRenderer: raw HTML is escaped, and Markdown images
 * (`![alt](url)`, `![alt][ref]`) become links, so a reply never fetches a URL. `![[x.png]]` vault embeds stay.
 *
 * This runs *before* trusted HTML injection points such as image embeds, so user text like `<meta-name>` renders as
 * plain text while intentional plugin markup can still be inserted afterward.
 */
export function escapeModelMarkdown(markdown: string): string {
  if (!markdown.includes('<') && !markdown.includes('![')) return markdown;
  return transformMarkdownSegments(markdown, {
    rawHtml: (html) => {
      const escaped = escapeHTML(html);
      // Only where a link could follow, so escaped text such as `<![CDATA[` keeps its `!`.
      return /\][([]/.test(escaped) ? imagesAsLinks(escaped) : escaped;
    },
    text: imagesAsLinks,
    math: (math) => math,
  });
}

/** Drops the `!` of every `![` that is not backslash-escaped. */
function imagesAsLinks(text: string): string {
  if (!text.includes('![')) return text;
  return text.replace(/(\\*)!\[/g, (match, slashes: string) => (slashes.length % 2 ? match : `${slashes}[`));
}
