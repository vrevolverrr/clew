import type { AgentSession, ToolApprovalRequest } from '@/agents/types';
import type { ChatContext } from '@/context/ChatContext';
import type { ChatTurn, ToolPart, TourStep } from '@/chat/ChatRecord';
import { quoteOf } from '@/context/NoteContext';
import { recordEvent, recordHighlight, startTurn } from '@/chat/ChatRecord';
import { ReplyActions, type ShownPart } from '@/chat/ReplyActions';
import { turnImages } from '@/context/ChatAttachment';
import { messageOf } from '@/shared/messageOf';

/** Asked in the turn, not the system prompt: Codex's default model skips it far more often there. */
const TITLE_REQUEST = '<naming>After your answer, add a blank line and a last line @Title("<at most six words>") naming this conversation, for example @Title("Eigenvalues of symmetric matrices"). The app hides that line from the student.</naming>';

/** What a running turn draws on. */
export interface TurnView {
  /** The session is open and has the turn. */
  sent(): void;
  appendText(delta: string): void;
  tool(part: ToolPart): void;
  thinking(): void;
  usage(used: number, window: number): void;
  /** Asks the student; drops the question once `signal` aborts. The turn keeps streaming meanwhile. */
  approve(request: ToolApprovalRequest, signal: AbortSignal): Promise<boolean>;
  /** The agent pointed at text in a note; its line has just ended, and the step is already in the record. */
  act(step: TourStep): void;
  /** The turn ended, recorded with the status and error it ended with. */
  finish(turn: ChatTurn): void;
}

interface TurnRequest {
  /** What the message carries. Its note is where a highlight that names no note points. */
  context: ChatContext;
  /** The folder the images' paths are relative to. */
  root: string;
  /** What the agent receives: the message with its context. */
  text: string;
  signal: AbortSignal;
  /** The conversation the chat held before this turn. */
  sessionId?: string;
  /** The chat's first turn, which sets its title: the agent's own if its CLI names conversations, else one it is asked to write. */
  wantTitle?: boolean;
}

/**
 * Runs one turn on the chat's session and records what happened. A session that cannot open, or a stream that
 * fails, ends the turn as failed instead of throwing; the record and the session id to keep come back either way.
 */
export async function runTurn(
  open: () => Promise<AgentSession>,
  { context, root, text, signal, sessionId, wantTitle }: TurnRequest,
  view: TurnView,
): Promise<{ turn: ChatTurn; sessionId: string | undefined; title: string | undefined }> {
  const { attachments } = context;
  const notePath = context.note?.path;
  let turn = startTurn(context.message, quoteOf(context.selection), attachments);
  let id = sessionId;
  let title: string | undefined;
  let written: string | undefined;
  const filter = new ReplyActions();
  const show = (parts: ShownPart[]): void => {
    for (const part of parts) {
      if ('text' in part) {
        turn = recordEvent(turn, { type: 'text', delta: part.text });
        view.appendText(part.text);
      } else if (part.action.name === 'Title') {
        written ??= part.action.params.text;
      } else {
        const path = part.action.params.path ?? notePath;
        // A highlight with no note to point at has nowhere to go.
        if (!path) continue;
        const step: TourStep = { ...part.action.params, path };
        turn = recordHighlight(turn, step);
        view.act(step);
      }
    }
  };
  try {
    const session = await open();
    id = session.id;
    view.sent();
    const asked = wantTitle && !session.title;
    for await (const event of session.send(asked ? `${text}\n\n${TITLE_REQUEST}` : text, signal, turnImages(attachments, root))) {
      if (event.type === 'text') {
        show(filter.push(event.delta));
        continue;
      }
      if (event.type === 'approval') {
        void view.approve(event.request, event.signal).then(event.answer, () => event.answer(false));
        continue;
      }
      if (event.type === 'done') show(filter.flush());
      // Diagnosis only: kept out of the saved chat and the reply, which show the short error.
      if (event.type === 'done' && event.detail) console.error(`Clew: ${event.error ?? 'the agent failed'}\n${event.detail}`);
      turn = recordEvent(turn, event);
      switch (event.type) {
        case 'tool':
          view.tool(event);
          break;
        case 'thinking':
          view.thinking();
          break;
        case 'usage':
          view.usage(event.used, event.window);
          break;
        case 'done':
          view.finish(turn);
          break;
      }
    }
    if (wantTitle) title = (await session.title?.().catch(() => undefined)) ?? written;
  } catch (error) {
    turn = recordEvent(turn, { type: 'done', status: 'failed', error: messageOf(error) });
    view.finish(turn);
  }
  return { turn, sessionId: id, title };
}
