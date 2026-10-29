import { z } from 'zod/v4';

import { FENCE, isClosingFence } from '@/chat/splitReply';

/** Names the chat; written once, on the last line of a conversation's first reply. */
const Title = z.object({ text: z.string().trim().min(1).max(80) });

/** Marks text in a note and scrolls it into view, with a short comment beside it; a run of them walks the student through the note. */
const Highlight = z.object({
  quote: z.string().trim().min(4).max(400),
  // Too long a comment is cut, not refused: the student still sees where the agent pointed.
  comment: z.string().trim().transform((text) => text.slice(0, 160) || undefined).optional(),
  // A note elsewhere in the vault; left out, the note the turn was sent with. A bad one fails the call, not the default note.
  path: z.string().trim().min(1).max(300).optional(),
  // A bad line number costs only the tie-break, not the highlight.
  line: z.number().int().positive().optional().catch(undefined),
});

const ACTIONS = { Title, Highlight } as const;

type ReplyAction = { [N in keyof typeof ACTIONS]: { name: N; params: z.output<(typeof ACTIONS)[N]> } }[keyof typeof ACTIONS];

/**
 * The action a line of the reply writes; null when it is not a complete call of a known action, and 'invalid' when it
 * is one with arguments the action does not take. Either way the line is no use to the student, but only the first
 * can be prose.
 */
export function parseActionLine(line: string): ReplyAction | 'invalid' | null {
  const call = parseCall(line.trim());
  if (!call || !Object.hasOwn(ACTIONS, call.name)) return null;
  const schema = ACTIONS[call.name as keyof typeof ACTIONS];
  const keys = Object.keys(schema.shape);
  if (call.args.length > keys.length) return 'invalid';
  const params = Object.fromEntries(keys.map((key, index) => [key, call.args[index]]));
  const parsed = schema.safeParse(params);
  return parsed.success ? ({ name: call.name, params: parsed.data } as ReplyAction) : 'invalid';
}

const CALL_START = /^@([A-Za-z][A-Za-z0-9]*)\s*\(\s*/y;
const ARG = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(-?\d+(?:\.\d+)?)(?![\w.])|(true|false)\b/y;
const ESCAPES: Record<string, string> = { n: '\n', t: '\t' };

/** `@Name(arg, ...)` filling the whole line, each argument a quoted string, a number or a boolean; null otherwise. */
export function parseCall(source: string): { name: string; args: (string | number | boolean)[] } | null {
  CALL_START.lastIndex = 0;
  const start = CALL_START.exec(source);
  if (!start) return null;
  const args: (string | number | boolean)[] = [];
  let at = CALL_START.lastIndex;
  const skip = (): void => {
    while (/\s/.test(source[at] ?? '')) at += 1;
  };
  if (source[at] !== ')') {
    for (;;) {
      ARG.lastIndex = at;
      const arg = ARG.exec(source);
      if (!arg) return null;
      const quoted = arg[1] ?? arg[2];
      if (quoted !== undefined) args.push(quoted.replace(/\\(.)/g, (_, char: string) => ESCAPES[char] ?? char));
      else if (arg[3] !== undefined) args.push(Number(arg[3]));
      else args.push(arg[4] === 'true');
      at = ARG.lastIndex;
      skip();
      if (source[at] !== ',') break;
      at += 1;
      skip();
    }
  }
  return source[at] === ')' && at === source.length - 1 ? { name: start[1], args } : null;
}

/** A piece of a reply in the order it was written: prose to show, or an action whose line ended. */
export type ShownPart = { text: string } | { action: ReplyAction };

/**
 * Takes the action lines out of a reply as it streams. Prose passes through at once; a line that starts with `@`
 * waits for its end, and goes back as prose when it is not a call of a known action. A call with bad arguments is
 * dropped, not shown. A `@` line inside a code fence is code.
 */
export class ReplyActions {
  private line = '';
  private fence: string | null = null;

  /** What to show for this chunk, with each action in its place among the prose. */
  push(chunk: string): ShownPart[] {
    const parts: ShownPart[] = [];
    let text = '';
    const flushText = (): void => {
      if (text) parts.push({ text });
      text = '';
    };
    for (const char of chunk) {
      if (char === '\n') {
        if (this.held) {
          const action = parseActionLine(this.line);
          if (action === null) {
            text += `${this.line}\n`;
          } else if (action !== 'invalid') {
            flushText();
            parts.push({ action });
          }
        } else {
          text += '\n';
        }
        this.endLine();
        continue;
      }
      this.line += char;
      if (!this.held) text += char;
    }
    flushText();
    return parts;
  }

  /** Ends the reply: a line still waiting for its end is an action if it is complete, else prose. */
  flush(): ShownPart[] {
    const action = this.held ? parseActionLine(this.line) : null;
    const text = this.held && action === null ? this.line : '';
    this.endLine();
    if (action && action !== 'invalid') return [{ action }];
    return text ? [{ text }] : [];
  }

  private endLine(): void {
    if (this.fence) {
      if (isClosingFence(this.line, this.fence)) this.fence = null;
    } else {
      this.fence = FENCE.exec(this.line)?.[1] ?? null;
    }
    this.line = '';
  }

  /** A line that starts with `@` outside a fence; the fence cannot change before the line ends. */
  private get held(): boolean {
    return this.line.startsWith('@') && !this.fence;
  }
}
