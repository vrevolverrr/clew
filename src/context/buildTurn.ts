import type { SkillSyntax } from '@/agents/types';
import { type NoteQuote, quoteOf } from '@/context/NoteContext';
import type { Viewport } from '@/shared/Viewport';
import { skillLeads } from '@/context/skillSyntax';
import type { FileText, TurnFile } from '@/context/ChatAttachment';
import { lineCount } from '@/shared/lineCount';

export interface TurnInput {
  message: string;
  /** How the agent reads a skill, to keep a message that names one where the agent reads it. */
  skillSyntax: SkillSyntax;
  /** The document open in the editor, if any. Its text is not sent; the agent reads the file by its path. */
  note?: { path: string; viewport?: Viewport };
  /** The files and pastes the student attached, named by absolute path; an image travels beside the text. */
  files?: TurnFile[];
  /** The start of the files to carry, by absolute path. A file without text is named only. */
  fileTexts?: ReadonlyMap<string, FileText>;
  selection?: NoteQuote;
}

/**
 * Each turn points at the open document and where the student is looking, and carries the exact selection.
 * A message whose skill runs only at the start of the prompt goes first.
 */
export function buildTurn({ message, skillSyntax, note, files, fileTexts, selection }: TurnInput): string {
  const context: string[] = [];
  if (note) context.push(noteElement(note));
  for (const { path, mention } of files ?? []) context.push(mention ?? attachmentElement(path, fileTexts?.get(path)));
  const quote = quoteOf(selection);
  if (quote) context.push(`<selection${selectionAttributes(quote)}>\n${quote.text}\n</selection>`);
  return (skillLeads(message, skillSyntax) ? [message, ...context] : [...context, message]).filter(Boolean).join('\n\n');
}

function attachmentElement(path: string, content: FileText | undefined): string {
  const named = `<attachment path="${escapeAttribute(path)}"`;
  if (!content) return `${named}/>`;
  return `${named} lines="1-${content.lines}"${content.truncated ? ' truncated="true"' : ''}>\n${content.text}\n</attachment>`;
}

function noteElement({ path, viewport }: NonNullable<TurnInput['note']>): string {
  const where = viewport ? ` ${viewport.unit}="${range(viewport.from, viewport.to)}"` : '';
  return `<note path="${escapeAttribute(path)}"${where}/>`;
}

function range(from: number, to: number | undefined): string {
  if (to === undefined) return `${from}-`;
  return from === to ? `${from}` : `${from}-${to}`;
}

function selectionAttributes({ path, text, startLine, page, source }: NonNullable<TurnInput['selection']>): string {
  if (source === 'chat') return ` source="chat" chatId="${escapeAttribute(path)}"`;
  let where = '';
  if (startLine !== undefined) where = ` lines="${startLine}-${startLine + lineCount(text) - 1}"`;
  else if (page !== undefined) where = ` page="${page}"`;
  return ` path="${escapeAttribute(path)}"${where}`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
