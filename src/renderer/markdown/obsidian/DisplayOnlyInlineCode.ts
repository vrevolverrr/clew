import { parser } from '@lezer/markdown';

const PLACEHOLDER_PREFIX = 'clew-inline-code-';

interface PreparedDisplayOnlyInlineCode {
  markdown: string;
  /** Rendered text of each code span, indexed by its placeholder number. */
  spans: string[];
}

/**
 * Replaces every inline code span's content with a placeholder. Plugins such as Dataview run
 * post-processors on rendered `<code>` text (`= query`, `$= js`) inside `MarkdownRenderer.render`,
 * with a configurable prefix, so model output must not reach them as code.
 */
export function prepareDisplayOnlyInlineCode(markdown: string): PreparedDisplayOnlyInlineCode {
  const spans: string[] = [];
  const edits: Array<{ from: number; to: number; text: string }> = [];
  parser.parse(markdown).iterate({
    enter(node) {
      if (node.name !== 'InlineCode') return;
      const open = node.node.firstChild;
      const close = node.node.lastChild;
      if (!open || !close || open === close) return false;
      edits.push({ from: open.to, to: close.from, text: `${PLACEHOLDER_PREFIX}${spans.length}` });
      spans.push(codeSpanText(markdown.slice(open.to, close.from)));
      return false;
    },
  });

  let prepared = markdown;
  for (const edit of edits.reverse()) {
    prepared = prepared.slice(0, edit.from) + edit.text + prepared.slice(edit.to);
  }
  return { markdown: prepared, spans };
}

/** Puts each span's text back into its rendered `<code>` element, after post-processors ran. */
export function restoreDisplayOnlyInlineCode(container: HTMLElement, spans: readonly string[]): void {
  if (spans.length === 0) return;
  for (const code of Array.from(container.querySelectorAll('code:not(pre > code)'))) {
    const text = code.textContent ?? '';
    if (!text.startsWith(PLACEHOLDER_PREFIX)) continue;
    const span = spans[Number(text.slice(PLACEHOLDER_PREFIX.length))];
    if (span !== undefined) code.textContent = span;
  }
}

/** CommonMark code span content: line endings become spaces, one padding space is stripped. */
function codeSpanText(raw: string): string {
  const text = raw.replace(/\r?\n/g, ' ');
  return /^ .* $/s.test(text) && text.trim() !== '' ? text.slice(1, -1) : text;
}
