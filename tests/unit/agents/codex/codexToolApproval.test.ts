import { codexToolApproval } from '@/agents/codex/codexToolApproval';
import type { ToolApprovalBlock } from '@/agents/types';

it('owns item fallback and preserves empty, false and zero request values', () => {
  const input = Object.freeze({
    command: '', cwd: 0, permissions: false,
    item: { command: 'fallback command', cwd: '/fallback', permissions: { network: true }, url: 'https://example.com' },
  });
  const request = codexToolApproval('this command', input);
  expect(request.fields).toEqual([
    { kind: 'command', value: '' },
    { kind: 'cwd', value: '0' },
    { kind: 'url', value: 'https://example.com' },
    { kind: 'permissions', value: 'false' },
  ]);
  expect(request.input).toBe(input);
});

it('suppresses only paths and change data already represented by normalized previews', () => {
  const request = codexToolApproval('these file changes', {
    file_path: null, path: 'other.md',
    item: { file_path: 'note.md', changes: [{ path: 'note.md', kind: 'add', diff: 'new contents' }] },
  });
  expect(request.fields).toEqual([{ kind: 'path', value: 'other.md' }]);
  expect(request.changes).toEqual([{ path: 'note.md', kind: 'add', blocks: [{ before: '', after: 'new contents' }] }]);
});

const codexChanges = (input: Readonly<Record<string, unknown>>) => codexToolApproval('these file changes', input).changes;
const versions = (block: ToolApprovalBlock) => {
  if (!('before' in block)) throw new Error('Expected a before/after block');
  return { before: block.before, after: block.after };
};

it('reads a native Codex patch from its item, retaining separate hunk boundaries and context', () => {
    const diff = '--- a/note.md\n+++ b/note.md\n@@ -1,2 +1,2 @@\n Heading\n-old words\n+new words\n@@ -20 +20 @@\n--- literal\n+++ literal\n';
    const [change] = codexChanges({ item: { changes: [{ path: 'note.md', kind: { type: 'update' }, diff }] } });
    expect(change?.kind).toBe('update');
    expect(change?.blocks.map((block) => block.label)).toEqual(['Line 1', 'Line 20']);
    expect(versions(change!.blocks[0]!)).toEqual({ before: 'Heading\nold words\n', after: 'Heading\nnew words\n' });
    expect(versions(change!.blocks[1]!)).toEqual({ before: '-- literal\n', after: '++ literal\n' });
  });

it('keeps leading patch-like characters in native full-file additions and deletions', () => {
    const text = '+++ heading\n--- body\n';
    const changes = codexChanges({ changes: [
      { path: 'added.md', kind: { type: 'add' }, diff: text },
      { path: 'deleted.md', kind: { type: 'delete' }, diff: text },
    ] });
    expect(versions(changes[0]!.blocks[0]!)).toEqual({ before: '', after: text });
    expect(versions(changes[1]!.blocks[0]!)).toEqual({ before: text, after: '' });
  });

it('keeps no-final-newline changes and describes them', () => {
    const [change] = codexChanges({ changes: [{ path: 'a.txt', diff: '@@ -1 +1 @@\n-same\n+same\n\\ No newline at end of file\n' }] });
    expect(versions(change!.blocks[0]!)).toEqual({ before: 'same\n', after: 'same' });
    expect(change!.blocks[0]!.label).toContain('Proposed: no final newline');
  });

it('renders prefix-only snippets without treating their contents as file headers', () => {
    const [change] = codexChanges({ changes: [{ path: 'a.md', diff: '--- text\n+++ text' }] });
    expect(versions(change!.blocks[0]!)).toEqual({ before: '-- text\n', after: '++ text\n' });
  });

it('preserves a carriage return in old line contents when the replacement uses LF', () => {
    const [change] = codexChanges({ changes: [{ path: 'a.txt', diff: '@@ -1 +1 @@\n-old\r\n+new\n' }] });
    expect(versions(change!.blocks[0]!)).toEqual({ before: 'old\r\n', after: 'new\n' });
  });

it('retains move metadata without adding its protocol suffix to the proposed text', () => {
    const [change] = codexChanges({ changes: [{ path: 'old.md', kind: { type: 'update', move_path: 'new.md' }, diff: '-old\n+new\n\nMoved to: new.md' }] });
    expect(change?.target).toBe('new.md');
    expect(versions(change!.blocks[0]!)).toEqual({ before: 'old\n', after: 'new\n' });
  });

it('keeps unrecognized patches as plain text and missing diffs explicitly labeled', () => {
    const changes = codexChanges({ changes: [
      { path: 'binary.bin', diff: 'Binary files differ' }, { path: 'empty.md', kind: 'update', diff: '' },
    ] });
    expect(changes[0]?.note).toContain('no inline preview');
    expect(changes[0]!.blocks[0]).toEqual({ text: 'Binary files differ' });
    expect(changes[1]?.note).toBe('No textual diff supplied.');
  });
 
it.each([
  {}, { changes: null }, { changes: {} }, { changes: [null] },
  { changes: [{ path: 'a', diff: '-old\n+new' }, { path: 'missing diff' }] },
  { changes: [{ path: 'a', kind: 'unknown', diff: 'x' }] },
])('retains unsupported change formats in the original input: %j', (input) => {
  const request = codexToolApproval('these file changes', input);
  expect(request.changes).toEqual([]);
  expect(request.input).toBe(input);
});

it.each([
  { command: 'curl https://example.com', cwd: '/vault' },
  { item: { command: 'curl https://example.com', cwd: '/vault', startedAtMs: 123 } },
  { command: null, cwd: null, item: { command: 'curl https://example.com', cwd: '/vault' } },
])('normalizes native command fields with nullish fallback: %j', (input) => {
  const request = codexToolApproval('this command', input, 'Check connectivity');
  expect(request.fields).toEqual([{ kind: 'command', value: 'curl https://example.com' }, { kind: 'cwd', value: '/vault' }]);
  expect(request.decisionReason).toBe('Check connectivity');
  expect(request.input).toBe(input);
});

it('prefers request fields to item fields and keeps unfamiliar changes fully visible', () => {
  const changes = [{ path: 'a.md', diff: '-old\n+new' }, { path: 'b.md', unsupported: true }];
  const input = { command: 'requested command', item: { command: 'item command', changes } };
  const request = codexToolApproval('these file changes', input);
  expect(request.fields).toEqual([
    { kind: 'command', value: 'requested command' },
    { kind: 'changes', value: JSON.stringify(changes, null, 2) },
  ]);
  expect(request.changes).toEqual([]);
});

it('labels empty file operations and normalizes additional permissions', () => {
  const request = codexToolApproval('these file changes', { changes: [
    { path: 'add.md', kind: 'add', diff: '' }, { path: 'delete.md', kind: 'delete', diff: '' },
  ] });
  expect(request.fields).toEqual([]);
  expect(request.changes.map((change) => change.note)).toEqual(['Add empty file.', 'Delete empty file.']);
  const permissions = { network: { enabled: true }, fileSystem: { read: ['/outside'] } };
  expect(codexToolApproval('this additional access', { permissions }).fields).toEqual([
    { kind: 'permissions', value: JSON.stringify(permissions, null, 2) },
  ]);
});
