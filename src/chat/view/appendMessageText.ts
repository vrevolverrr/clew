import type { SkillSyntax } from '@/agents/types';
import { skillTokens } from '@/context/skillSyntax';
import { mentionTokens } from '@/attachments/mentionSyntax';
import { inlineMathRanges } from '@/renderer/markdown/inlineMath';

interface MessageTokens {
  skill: SkillSyntax;
  /** The picked files: what follows the `@` to name each, and the path shown on hover. */
  mentions: ReadonlyMap<string, string>;
  /** The `@name` being typed, drawn like a skill name. */
  typing?: { start: number; end: number };
  /** Draws a `$...$` span as maths. Without it, dollar signs stay text, as in the box being typed in. */
  math?: (source: string) => Node;
}

interface Span {
  start: number;
  end: number;
  cls?: string;
  title?: string;
  /** Set for maths: the span is drawn by `math`, not as a styled span. */
  source?: string;
}

/** Appends the text to `parent`, with each skill name, picked file, and name being typed in its own span, and each `$...$` drawn as maths when `math` is given. */
export function appendMessageText(parent: HTMLElement, text: string, { skill, mentions, typing, math }: MessageTokens): void {
  const spans: Span[] = [
    ...skillTokens(text, skill).map((range) => ({ ...range, cls: 'clew-skill-token' })),
    ...mentionTokens(text, [...mentions.keys()]).map(({ start, end, token }) => ({ start, end, cls: 'clew-mention-token', title: mentions.get(token) })),
    ...(typing ? [{ ...typing, cls: 'clew-skill-token' }] : []),
    ...(math ? inlineMathRanges(text).map(({ start, end, source }) => ({ start, end, source })) : []),
  ].sort((a, b) => a.start - b.start);
  let at = 0;
  for (const { start, end, cls, title, source } of spans) {
    // Where two overlap, the first drawn stands.
    if (start < at) continue;
    parent.appendText(text.slice(at, start));
    if (math && source !== undefined) parent.appendChild(math(source));
    else parent.createSpan({ cls, text: text.slice(start, end), ...(title ? { attr: { title } } : {}) });
    at = end;
  }
  parent.appendText(text.slice(at));
}
