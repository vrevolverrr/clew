import { claudeToolApproval } from '@/agents/claude/claudeToolApproval';

it('keeps summary order and empty values while suppressing file rows already previewed', () => {
  const permissions = { network: false };
  const input = Object.freeze({
    command: '', file_path: 'note.md', path: 'note.md', cwd: '/vault', url: null, permissions,
    old_string: 'before', new_string: 'after', changes: 'already represented',
  });
  const request = claudeToolApproval('Edit', input);
  expect(request.fields).toEqual([
    { kind: 'command', value: '' },
    { kind: 'cwd', value: '/vault' },
    { kind: 'permissions', value: JSON.stringify(permissions, null, 2) },
  ]);
  expect(request.input).toBe(input);
  expect(request.changes).toHaveLength(1);
});

it('keeps distinct paths and unfamiliar change data in its summary', () => {
  const changes = { unsupported: true };
  expect(claudeToolApproval('custom_tool', {
    command: null, file_path: 'one.md', path: 'two.md', cwd: undefined, url: 'https://example.com', changes,
  }).fields).toEqual([
    { kind: 'file', value: 'one.md' },
    { kind: 'path', value: 'two.md' },
    { kind: 'url', value: 'https://example.com' },
    { kind: 'changes', value: JSON.stringify(changes, null, 2) },
  ]);
});

it('normalizes a single replacement and its scope without a duplicate file field', () => {
  const input = { file_path: 'note.md', old_string: 'old', new_string: 'new', replace_all: true };
  const request = claudeToolApproval('Edit', input, 'Update the note');
  expect(request.description).toBe('editing this file');
  expect(request.decisionReason).toBe('Update the note');
  expect(request.input).toBe(input);
  expect(request.fields).toEqual([]);
  expect(request.changes).toEqual([{
    path: 'note.md', kind: 'update', note: 'Applies to every matching occurrence.',
    blocks: [{ before: 'old', after: 'new' }],
  }]);
});

it('keeps multiple edits separate and labels repeated replacements', () => {
  const request = claudeToolApproval('MultiEdit', { file_path: 'note.md', edits: [
    { old_string: 'first', new_string: 'second' },
    { old_string: 'third', new_string: 'fourth', replace_all: true },
  ] });
  expect(request.changes[0]?.blocks).toEqual([
    { label: 'Edit 1', before: 'first', after: 'second' },
    { label: 'Edit 2 · all matching occurrences', before: 'third', after: 'fourth' },
  ]);
});

it.each(['', 'Proposed contents'])('does not invent old contents for a write: %j', (content) => {
  const request = claudeToolApproval('Write', { file_path: 'note.md', content });
  expect(request.changes).toEqual([{
    path: 'note.md', kind: 'write',
    note: 'Proposed contents; previous contents were not supplied.',
    blocks: [{ text: content }],
  }]);
  expect(request.fields).toEqual([]);
});

it.each([
  {}, { file_path: 'a', edits: [null] }, { file_path: 'a', edits: [] },
  { file_path: 'a', edits: [{ old_string: 'before' }] },
  { file_path: 'a', old_string: 'old' },
])('keeps unsupported edits available in the original input: %j', (input) => {
  const request = claudeToolApproval('Edit', input);
  expect(request.changes).toEqual([]);
  expect(request.input).toBe(input);
});

it.each(['custom_tool', 'constructor', 'toString', '__proto__'])('keeps unfamiliar tool %s as its description without treating it as a native edit', (tool) => {
  const input = { file_path: 'note.md', old_string: 'old', new_string: 'new' };
  const request = claudeToolApproval(tool, input);
  expect(request.description).toBe(tool);
  expect(request.changes).toEqual([]);
  expect(request.fields).toEqual([{ kind: 'file', value: 'note.md' }]);
});
