import { claudeToolApproval } from '@/agents/claude/claudeToolApproval';
import { codexToolApproval } from '@/agents/codex/codexToolApproval';

it('exposes the same summary contract for equivalent native commands', () => {
  const claude = claudeToolApproval('Bash', { command: 'ls -la', cwd: '/vault' });
  const codex = codexToolApproval('this command', { item: { command: 'ls -la', cwd: '/vault' } });
  expect(claude.fields).toEqual([
    { kind: 'command', value: 'ls -la' },
    { kind: 'cwd', value: '/vault' },
  ]);
  expect(codex.fields).toEqual(claude.fields);
});

it('exposes the same file-change contract for equivalent native edits', () => {
  const claude = claudeToolApproval('Edit', {
    file_path: 'note.md', old_string: 'old text\n', new_string: 'new text\n',
  });
  const codex = codexToolApproval('these file changes', { item: { changes: [{
    path: 'note.md', kind: { type: 'update' }, diff: '-old text\n+new text\n',
  }] } });
  expect(claude.changes).toEqual([
    { path: 'note.md', kind: 'update', blocks: [{ before: 'old text\n', after: 'new text\n' }] },
  ]);
  expect(codex.changes).toEqual(claude.changes);
  expect(claude.fields).toEqual(codex.fields);
});
