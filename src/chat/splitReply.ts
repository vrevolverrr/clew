/** Fence languages that become segments of their own, by the kind each becomes. */
const KINDS = { 'openui-lang': 'openui', mermaid: 'mermaid' } as const;
type OwnKind = (typeof KINDS)[keyof typeof KINDS];

export type ReplySegment =
  | { kind: 'prose'; text: string }
  | { kind: OwnKind; text: string; closed: boolean };

const OWN_FENCE = new RegExp(`^ {0,3}(\`{3,}|~{3,})[ \\t]*(${Object.keys(KINDS).join('|')})[ \\t]*$`);
export const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const MAYBE_FENCE = /^ {0,3}(``|~~)/;

/**
 * Splits a reply into Markdown prose and ```` ```openui-lang ```` and ```` ```mermaid ```` fences. Re-run on the
 * whole reply each chunk: the last line may be partial until `complete`, and an open fence stays unclosed.
 */
export function splitReply(text: string, complete: boolean): ReplySegment[] {
  const segments: ReplySegment[] = [];
  const lines = text.split('\n');
  let own: { kind: OwnKind; lines: string[]; marker: string } | null = null;
  let codeMarker: string | null = null;

  const prose = (line: string) => {
    const last = segments.at(-1);
    if (last?.kind === 'prose') last.text += `\n${line}`;
    else segments.push({ kind: 'prose', text: line });
  };

  for (const [index, line] of lines.entries()) {
    const partial = index === lines.length - 1 && !complete;
    if (own) {
      if (!partial && isClosingFence(line, own.marker)) {
        segments.push({ kind: own.kind, text: own.lines.join('\n'), closed: true });
        own = null;
      } else if (!(partial && MAYBE_FENCE.test(line))) {
        own.lines.push(line);
      }
      continue;
    }
    if (codeMarker) {
      if (!partial && isClosingFence(line, codeMarker)) codeMarker = null;
      prose(line);
      continue;
    }
    // A fence opener cut mid-line would flash as prose before it becomes a fence.
    if (partial && MAYBE_FENCE.test(line)) continue;
    const ownMatch = OWN_FENCE.exec(line);
    if (ownMatch) {
      own = { kind: KINDS[ownMatch[2] as keyof typeof KINDS], lines: [], marker: ownMatch[1]! };
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) codeMarker = fence[1]!;
    prose(line);
  }

  if (own) segments.push({ kind: own.kind, text: own.lines.join('\n'), closed: false });
  return segments.filter((segment) => segment.kind !== 'prose' || segment.text.trim() !== '');
}

export function isClosingFence(line: string, marker: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= marker.length && trimmed === marker[0]!.repeat(trimmed.length);
}
