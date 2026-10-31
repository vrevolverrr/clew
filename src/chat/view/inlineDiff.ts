export interface ApprovalDiffPart {
  readonly kind: 'same' | 'removed' | 'added';
  readonly text: string;
}

export function inlineDiff(before: string, after: string): readonly ApprovalDiffPart[] {
  const tokenize = (text: string): string[] => text.match(/\s+|[\p{L}\p{N}\p{M}_]+|[^\s]/gu) ?? [];
  const old = tokenize(before), next = tokenize(after);
  let start = 0, oldEnd = old.length, nextEnd = next.length;
  while (start < oldEnd && start < nextEnd && old[start] === next[start]) start++;
  while (oldEnd > start && nextEnd > start && old[oldEnd - 1] === next[nextEnd - 1]) { oldEnd--; nextEnd--; }
  const parts: ApprovalDiffPart[] = [];
  const append = (kind: ApprovalDiffPart['kind'], text: string): void => {
    if (!text) return;
    const previous = parts.at(-1);
    if (previous?.kind === kind) parts[parts.length - 1] = { kind, text: previous.text + text };
    else parts.push({ kind, text });
  };
  append('same', old.slice(0, start).join(''));
  const rows = oldEnd - start + 1, columns = nextEnd - start + 1;
  if (rows === 1 || columns === 1 || rows * columns > 250_000) {
    append('removed', old.slice(start, oldEnd).join(''));
    append('added', next.slice(start, nextEnd).join(''));
  } else {
    const lengths = new Uint32Array(rows * columns);
    for (let i = rows - 2; i >= 0; i--) for (let j = columns - 2; j >= 0; j--) {
      lengths[i * columns + j] = old[start + i] === next[start + j]
        ? 1 + lengths[(i + 1) * columns + j + 1]
        : Math.max(lengths[(i + 1) * columns + j], lengths[i * columns + j + 1]);
    }
    let i = start, j = start;
    while (i < oldEnd && j < nextEnd) {
      if (old[i] === next[j]) { append('same', old[i++]); j++; }
      else if (lengths[(i - start + 1) * columns + j - start] >= lengths[(i - start) * columns + j - start + 1]) append('removed', old[i++]);
      else append('added', next[j++]);
    }
    append('removed', old.slice(i, oldEnd).join(''));
    append('added', next.slice(j, nextEnd).join(''));
  }
  append('same', old.slice(oldEnd).join(''));
  // Shared spaces should not split one phrase replacement into alternating word highlights.
  const grouped: ApprovalDiffPart[] = [];
  for (let at = 0; at < parts.length;) {
    const current = parts[at];
    if (current.kind === 'same') { grouped.push(current); at++; continue; }
    let end = at + 1;
    while (end < parts.length && (parts[end].kind !== 'same'
      || (/^\s+$/u.test(parts[end].text) && parts[end + 1] !== undefined && parts[end + 1].kind !== 'same'))) end++;
    const changed = parts.slice(at, end);
    const removed = changed.filter((part) => part.kind !== 'added').map((part) => part.text).join('');
    const added = changed.filter((part) => part.kind !== 'removed').map((part) => part.text).join('');
    if (removed) grouped.push({ kind: 'removed', text: removed });
    if (added) grouped.push({ kind: 'added', text: added });
    at = end;
  }
  return grouped;
}
