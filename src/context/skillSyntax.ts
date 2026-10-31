import type { SkillSyntax } from '@/agents/types';

export interface SkillTrigger {
  /** Index of the prefix character. */
  start: number;
  /** What was typed after the prefix. */
  query: string;
}

const SKILL_NAME = '[\\w:-]';

/** Whether the message names a skill that runs only at the start of the prompt, so nothing may go before it. */
export function skillLeads(message: string, syntax: SkillSyntax): boolean {
  return syntax.atStart && skillTokens(message, syntax).length > 0;
}

/** The skill name being typed at the cursor. */
export function skillTrigger(text: string, cursor: number, syntax: SkillSyntax): SkillTrigger | null {
  const match = new RegExp(`${skillStart(syntax)}(${SKILL_NAME}*)$`).exec(text.slice(0, cursor));
  return match ? { start: match.index, query: match[1] } : null;
}

/**
 * The skill names typed in the text, as the agent would read them, each followed by whitespace or the end.
 * Nothing checks the name against the CLI's list.
 */
export function skillTokens(text: string, syntax: SkillSyntax): { start: number; end: number }[] {
  const pattern = new RegExp(`${skillStart(syntax)}${SKILL_NAME}+(?=\\s|$)`, 'g');
  return Array.from(text.matchAll(pattern), (match) => ({ start: match.index, end: match.index + match[0].length }));
}

function skillStart({ prefix, atStart }: SkillSyntax): string {
  return `${atStart ? '^' : '(?<=^|\\s)'}${prefix.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`;
}
