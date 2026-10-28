import type { ToolApprovalFileChange, ToolApprovalRequest } from '@/agents/types';
import { inlineDiff, type ApprovalDiffPart } from '@/chat/view/inlineDiff';
import { setIcon } from '@/shared/view/icon';

interface PendingApproval {
  readonly resolve: (approved: boolean) => void;
  readonly detach: () => void;
}

/**
 * Each chat owns its pending approvals, including while its presentation is hidden. The card shows the first and
 * draws plain text only: tool arguments are untrusted and can contain code or markup.
 */
export class ApprovalCard {
  private readonly el: HTMLElement;
  private readonly pending = new Map<ToolApprovalRequest, PendingApproval>();
  private current: ToolApprovalRequest | undefined;

  constructor(parent: HTMLElement, private readonly changed: () => void) {
    this.el = parent.createDiv({ cls: 'clew-approval-card', attr: { role: 'region', 'aria-live': 'polite' } });
    this.el.hidden = true;
  }

  get size(): number { return this.pending.size; }

  /** Resolves with the student's answer, or false once `signal` aborts. */
  ask(request: ToolApprovalRequest, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      const abort = (): void => this.answer(request, false);
      this.pending.set(request, { resolve, detach: () => signal.removeEventListener('abort', abort) });
      signal.addEventListener('abort', abort, { once: true });
      this.render();
    });
  }

  private answer(request: ToolApprovalRequest, approved: boolean): void {
    const entry = this.pending.get(request);
    if (!entry) return;
    this.pending.delete(request);
    entry.detach();
    entry.resolve(approved);
    this.render();
  }

  private render(): void {
    const request = this.pending.keys().next().value;
    this.el.hidden = !request;
    if (request !== this.current) {
      this.current = request;
      this.el.empty();
      if (request) this.draw(request);
    }
    this.changed();
  }

  private draw(request: ToolApprovalRequest): void {
    const body = this.el.createDiv({ cls: 'clew-approval-body' });
    const header = body.createDiv({ cls: 'clew-approval-header' });
    setIcon(header.createSpan({ cls: 'clew-approval-icon', attr: { 'aria-hidden': 'true' } }), 'shield-question');
    const title = header.createDiv({ cls: 'clew-approval-title', text: `Allow ${request.description}?`, attr: { id: `clew-approval-${crypto.randomUUID()}` } });
    this.el.setAttribute('aria-labelledby', title.id);
    if (request.decisionReason) body.createDiv({ cls: 'clew-approval-reason', text: request.decisionReason });

    const summary = body.createDiv({ cls: 'clew-approval-summary' });
    for (const change of request.changes) this.drawChange(summary, change);
    const fields = {
      command: ['Command', 'terminal'], file: ['File', 'file-text'], path: ['Path', 'file-text'],
      cwd: ['Working directory', 'folder'], url: ['URL', 'globe'], permissions: ['Access', 'shield'],
      changes: ['Changes', 'files'],
    } as const;
    for (const field of request.fields) {
      const [label, icon] = fields[field.kind];
      const row = summary.createDiv({ cls: 'clew-approval-row', attr: { 'data-field': field.kind } });
      setIcon(row.createSpan({ cls: 'clew-approval-row-icon', attr: { 'aria-hidden': 'true' } }), icon);
      const content = row.createDiv({ cls: 'clew-approval-row-content' });
      content.createDiv({ cls: field.kind === 'command' || field.kind === 'cwd' ? 'clew-visually-hidden' : 'clew-approval-label', text: label });
      content.createEl('pre', { cls: 'clew-approval-value', text: field.value });
    }
    const details = summary.createEl('details', { cls: 'clew-approval-disclosure' });
    details.open = request.changes.length + request.fields.length === 0;
    const toggle = details.createEl('summary');
    setIcon(toggle.createSpan({ cls: 'clew-approval-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
    toggle.createSpan({ text: 'Request details' });
    details.createEl('pre', { cls: 'clew-approval-details', text: JSON.stringify(request.input, null, 2) });
    const actions = this.el.createDiv({ cls: 'clew-approval-actions' });
    for (const [text, approved] of [['Deny', false], ['Allow once', true]] as const) {
      const button = actions.createEl('button', { text, cls: approved ? 'clew-approval-allow' : 'clew-approval-deny', attr: { type: 'button' } });
      button.addEventListener('click', () => {
        if (this.current === request) this.answer(request, approved);
      });
    }
  }

  private drawChange(parent: HTMLElement, change: ToolApprovalFileChange): void {
    const file = parent.createDiv({ cls: 'clew-approval-diff' });
    const header = file.createDiv({ cls: 'clew-approval-diff-header' });
    setIcon(header.createSpan({ cls: 'clew-approval-row-icon', attr: { 'aria-hidden': 'true' } }), 'file-text');
    header.createSpan({ cls: 'clew-approval-diff-path', text: change.path });
    header.createSpan({ cls: 'clew-approval-diff-kind', text: change.target ? 'Renamed' : { add: 'Added', delete: 'Deleted', update: 'Modified', write: 'Contents' }[change.kind] });
    if (change.target) file.createDiv({ cls: 'clew-approval-diff-note', text: `Move to ${change.target}` });
    if (change.note) file.createDiv({ cls: 'clew-approval-diff-note', text: change.note });
    for (const block of change.blocks) {
      if (block.label) file.createDiv({ cls: 'clew-approval-diff-note', text: block.label });
      const text = file.createDiv({ cls: 'clew-approval-diff-text', attr: { dir: 'auto' } });
      const parts: readonly ApprovalDiffPart[] = 'text' in block ? [{ kind: 'same', text: block.text }] : inlineDiff(block.before, block.after);
      for (const part of parts) text.createEl(part.kind === 'removed' ? 'del' : part.kind === 'added' ? 'ins' : 'span', { text: part.text });
    }
  }
}
