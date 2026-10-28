import type { AgentAdapter } from '@/agents/types';
import type { ChatContext } from '@/context/ChatContext';
import { buildTurn, type TurnInput } from '@/context/buildTurn';
import { readTexts, turnFiles } from '@/context/ChatAttachment';

/** What the text depends on about the agent, not the message: the same context reads differently to each CLI. */
interface TurnAgent extends Pick<TurnInput, 'skillSyntax'>, Pick<AgentAdapter, 'fileMention'> {
  /** The folder a stored attachment's path is relative to. */
  root: string;
}

/** What the agent receives for a message: the message with the open note, its attachments and the selection around it. */
export async function turnText({ message, attachments, note, selection }: ChatContext, { skillSyntax, fileMention, root }: TurnAgent): Promise<string> {
  const files = turnFiles(attachments, root, fileMention);
  const fileTexts = await readTexts(files.filter(({ mention }) => mention === undefined).map(({ path }) => path));
  return buildTurn({ message, skillSyntax, note, selection, files, fileTexts });
}
