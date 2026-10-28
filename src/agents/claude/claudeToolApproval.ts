import type { ToolApprovalFileChange, ToolApprovalRequest } from '@/agents/types';

const DESCRIPTIONS: Readonly<Record<string, string>> = {
  Read: 'reading this file', Write: 'writing this file', Edit: 'editing this file',
  MultiEdit: 'editing these files', NotebookEdit: 'editing this notebook', Bash: 'running this command',
};

export function claudeToolApproval(tool: string, input: Readonly<Record<string, unknown>>, decisionReason?: string): ToolApprovalRequest {
  const description = Object.hasOwn(DESCRIPTIONS, tool) ? DESCRIPTIONS[tool] : tool;
  const changes = tool === 'Edit' || tool === 'MultiEdit' || tool === 'Write' ? fileChanges(input) : [];
  const fields = ([
    ['command', input.command],
    ['file', input.file_path],
    ['path', input.path],
    ['cwd', input.cwd],
    ['url', input.url],
    ['permissions', input.permissions],
    ['changes', input.changes],
  ] as const).flatMap(([kind, value]) => {
    if (value === undefined || value === null) return [];
    if (kind === 'changes' && changes.length) return [];
    if ((kind === 'file' || kind === 'path') && changes.some((change) => change.path === value)) return [];
    return [{ kind, value: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
  });
  return { description, decisionReason, input, changes, fields };
}

function fileChanges(input: Readonly<Record<string, unknown>>): readonly ToolApprovalFileChange[] {
  if (typeof input.file_path !== 'string') return [];
  const edits = Array.isArray(input.edits) ? input.edits : [input];
  if (edits.length && edits.every((edit) => edit && typeof edit === 'object' && !Array.isArray(edit)
    && typeof edit.old_string === 'string' && typeof edit.new_string === 'string')) {
    return [{
      path: input.file_path, kind: 'update',
      blocks: edits.map((edit, index) => ({
        label: input.edits ? `Edit ${index + 1}${edit.replace_all === true ? ' · all matching occurrences' : ''}` : undefined,
        before: edit.old_string, after: edit.new_string,
      })),
      ...(input.replace_all === true ? { note: 'Applies to every matching occurrence.' } : {}),
    }];
  }
  if (typeof input.content === 'string') return [{
    path: input.file_path, kind: 'write',
    note: 'Proposed contents; previous contents were not supplied.',
    blocks: [{ text: input.content }],
  }];
  return [];
}
