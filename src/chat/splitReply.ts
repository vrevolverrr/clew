/** Fence languages that become segments of their own, by the kind each becomes. */
const KINDS = { figure: 'figure', mermaid: 'mermaid' } as const;
type OwnKind = (typeof KINDS)[keyof typeof KINDS];

export type ReplySegment =
  | { kind: 'prose'; text: string }
  | { kind: OwnKind; text: string; closed: boolean };

const OWN_FENCE = new RegExp(`^ {0,3}(\`{3,}|~{3,})[ \\t]*(${Object.keys(KINDS).join('|')})[ \\t]*$`);
export const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** A fence longer than any backtick run in `source`, so no line of it closes the fence early. */
export const fenceFor = (source: string): string => '`'.repeat(Math.max(3, ...(source.match(/`+/g) ?? []).map((run) => run.length + 1)));
const MAYBE_FENCE = /^ {0,3}(``|~~)/;

/**
 * Splits a reply into Markdown prose and ```` ```figure ```` and ```` ```mermaid ```` fences. Re-run on the
 * whole reply each chunk: the last line may be partial until `complete`, and an open fence stays unclosed.
 * A ```` ```jsx ```` fence stays code: a figure never runs from a code sample.
 */
export function splitReply(text: string, complete: boolean): ReplySegment[] {
  return scan(text, complete).map(({ segment }) => segment).filter((segment) => segment.kind !== 'prose' || segment.text.trim() !== '');
}

/** How many figures a finished reply's text holds, closed or not, counted as `splitReply` finds them. */
export function countFigures(text: string): number {
  return scan(text, true).filter(({ segment }) => segment.kind === 'figure').length;
}

/**
 * The text with the figures numbered `first`, `first + 1`, … replaced by the sources in `fixes` (keyed by that
 * number), each in a fresh fence; a replaced figure that was never closed gets its closing fence.
 */
export function replaceFigures(text: string, fixes: ReadonlyMap<number, string>, first: number): string {
  const lines = text.split('\n');
  let ordinal = first;
  let out: string[] = [];
  let at = 0;
  for (const { segment, start, end } of scan(text, true)) {
    if (segment.kind !== 'figure') continue;
    const fix = fixes.get(ordinal);
    ordinal += 1;
    if (fix === undefined) continue;
    const fence = fenceFor(fix);
    out = [...out, ...lines.slice(at, start), `${fence}figure`, fix, fence];
    at = end;
  }
  return [...out, ...lines.slice(at)].join('\n');
}

interface Scanned {
  segment: ReplySegment;
  /** The segment's lines, fences included: `start` inclusive, `end` exclusive. */
  start: number;
  end: number;
}

function scan(text: string, complete: boolean): Scanned[] {
  const segments: Scanned[] = [];
  const lines = text.split('\n');
  let own: { kind: OwnKind; lines: string[]; marker: string; start: number } | null = null;
  let codeMarker: string | null = null;

  const prose = (line: string, index: number) => {
    const last = segments.at(-1);
    if (last?.segment.kind === 'prose') {
      last.segment.text += `\n${line}`;
      last.end = index + 1;
    } else segments.push({ segment: { kind: 'prose', text: line }, start: index, end: index + 1 });
  };

  for (const [index, line] of lines.entries()) {
    const partial = index === lines.length - 1 && !complete;
    if (own) {
      if (!partial && isClosingFence(line, own.marker)) {
        segments.push({ segment: { kind: own.kind, text: own.lines.join('\n'), closed: true }, start: own.start, end: index + 1 });
        own = null;
      } else if (!(partial && MAYBE_FENCE.test(line))) {
        own.lines.push(line);
      }
      continue;
    }
    if (codeMarker) {
      if (!partial && isClosingFence(line, codeMarker)) codeMarker = null;
      prose(line, index);
      continue;
    }
    // A fence opener cut mid-line would flash as prose before it becomes a fence.
    if (partial && MAYBE_FENCE.test(line)) continue;
    const ownMatch = OWN_FENCE.exec(line);
    if (ownMatch) {
      own = { kind: KINDS[ownMatch[2] as keyof typeof KINDS], lines: [], marker: ownMatch[1]!, start: index };
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) codeMarker = fence[1]!;
    prose(line, index);
  }

  if (own) segments.push({ segment: { kind: own.kind, text: own.lines.join('\n'), closed: false }, start: own.start, end: lines.length });
  return segments;
}

export function isClosingFence(line: string, marker: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= marker.length && trimmed === marker[0]!.repeat(trimmed.length);
}
