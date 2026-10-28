import type { ToolApprovalBlock, ToolApprovalFileChange, ToolApprovalRequest } from '@/agents/types';

export function codexToolApproval(description: string, input: Readonly<Record<string, unknown>>, decisionReason?: string): ToolApprovalRequest {
  const item = record(input.item);
  const native = input.changes ?? item?.changes;
  const parsed = Array.isArray(native) ? native.map(fileChange) : [];
  // Keep the complete native changes summary if any entry cannot be normalized.
  const changes = parsed.every((change): change is ToolApprovalFileChange => change !== undefined) ? parsed : [];
  const fields = ([
    ['command', input.command ?? item?.command],
    ['file', input.file_path ?? item?.file_path],
    ['path', input.path ?? item?.path],
    ['cwd', input.cwd ?? item?.cwd],
    ['url', input.url ?? item?.url],
    ['permissions', input.permissions ?? item?.permissions],
    ['changes', native],
  ] as const).flatMap(([kind, value]) => {
    if (value === undefined || value === null) return [];
    if (kind === 'changes' && changes.length) return [];
    if ((kind === 'file' || kind === 'path') && changes.some((change) => change.path === value)) return [];
    return [{ kind, value: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
  });
  return { description, decisionReason, input, changes, fields };
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined;
}

function fileChange(value: unknown): ToolApprovalFileChange | undefined {
  const change = record(value);
  if (!change || typeof change.path !== 'string' || typeof change.diff !== 'string') return undefined;
  const metadata = record(change.kind);
  const kind = metadata?.type ?? change.kind ?? 'update';
  if (kind !== 'add' && kind !== 'delete' && kind !== 'update') return undefined;
  if (kind !== 'update') return {
    path: change.path, kind,
    blocks: [{ before: kind === 'delete' ? change.diff : '', after: kind === 'add' ? change.diff : '' }],
    ...(change.diff === '' ? { note: `${kind === 'add' ? 'Add' : 'Delete'} empty file.` } : {}),
  };
  const target = typeof metadata?.move_path === 'string' ? metadata.move_path : undefined;
  const suffix = target === undefined ? undefined : `\n\nMoved to: ${target}`;
  const patch = suffix && change.diff.endsWith(suffix) ? change.diff.slice(0, -suffix.length) : change.diff;
  const blocks = patchBlocks(patch);
  return {
    path: change.path, kind, target,
    blocks: blocks ?? (patch ? [{ text: patch }] : []),
    ...(!blocks ? { note: patch ? 'Original patch (no inline preview available).' : 'No textual diff supplied.' } : {}),
  };
}

function patchBlocks(patch: string): readonly ToolApprovalBlock[] | undefined {
  const blocks: ToolApprovalBlock[] = [];
  let label: string | undefined, before = '', after = '', lastPrefix: string | undefined;
  const flush = (): void => {
    if (lastPrefix !== undefined) blocks.push({ label, before, after });
    before = ''; after = ''; lastPrefix = undefined;
  };
  const lines = patch.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const hasHunks = lines.some((line) => line.startsWith('@@ '));
  for (const source of lines) {
    const line = source.endsWith('\r') ? source.slice(0, -1) : source;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) { flush(); label = `Line ${Number(hunk[1]) || Number(hunk[2])}`; continue; }
    if (hasHunks && !label && lastPrefix === undefined && /^(?:diff --git |index |--- |\+\+\+ |(?:new|deleted) file mode |old mode |new mode )/.test(line)) continue;
    if (line === '\\ No newline at end of file' && lastPrefix !== undefined) {
      if (lastPrefix !== '+') before = before.slice(0, -1);
      if (lastPrefix !== '-') after = after.slice(0, -1);
      const version = lastPrefix === '-' ? 'Original' : lastPrefix === '+' ? 'Proposed' : 'Both versions';
      label = [label, `${version}: no final newline`].filter(Boolean).join(' · ');
      continue;
    }
    const prefix = line[0];
    if (prefix !== ' ' && prefix !== '-' && prefix !== '+') return undefined;
    const text = source.slice(1) + '\n';
    if (prefix !== '+') before += text;
    if (prefix !== '-') after += text;
    lastPrefix = prefix;
  }
  flush();
  return blocks.length ? blocks : undefined;
}
