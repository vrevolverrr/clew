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
  // A span the segmenter takes for maths, a destination or HTML may not be one to Obsidian, so each is rewritten too.
  const keepFactorials = !REFERENCE_DEFINITION.test(markdown);
  return transformMarkdownSegments(markdown, {
    rawHtml: (html) => imagesAsLinks(escapeHTML(html)),
    text: (text) => imagesAsLinks(text),
    destination: (destination) => imagesAsLinks(destination),
    math: (math) => imagesAsLinks(math, keepFactorials),
  });
}

const REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:/m;

/**
 * Drops the `!` of every `![` that is not backslash-escaped. With `keepFactorials`, a factorial in maths (`n![x^n]`)
 * keeps it when nothing link-shaped (`](` or `][`) follows on its line; the caller allows that only when the reply
 * defines no reference link, so a shortcut image `![x]` cannot resolve.
 */
function imagesAsLinks(text: string, keepFactorials = false): string {
  if (!text.includes('![')) return text;
  return text.replace(/(\\*)!\[/g, (match, slashes: string, at: number) => {
    if (slashes.length % 2) return match;
    const after = text.slice(at + match.length).split('\n', 1)[0];
    const factorial = keepFactorials && !slashes && /[\w)}\]]/.test(text[at - 1] ?? '') && !/\][([]/.test(after);
    return factorial ? match : `${slashes}[`;
  });
}
