import type { AgentQuestion, QuestionAnswers, ToolApprovalFileChange, ToolApprovalRequest } from '@/agents/types';
import { inlineDiff, type ApprovalDiffPart } from '@/chat/view/inlineDiff';
import { setIcon } from '@/shared/view/icon';

/**
 * Each chat owns its pending approvals and questions, including while its presentation is hidden. The card shows the
 * first and draws plain text only: tool arguments are untrusted and can contain code or markup.
 */
export class ApprovalCard {
  private readonly el: HTMLElement;
  private readonly pending = new Map<object, () => void>();
  private current: object | undefined;

  constructor(parent: HTMLElement, private readonly changed: () => void) {
    this.el = parent.createDiv({ cls: 'clew-approval-card', attr: { role: 'region', 'aria-live': 'polite' } });
    this.el.hidden = true;
  }

  get size(): number { return this.pending.size; }

  /** Resolves with the student's answer, or false once `signal` aborts. */
  ask(request: ToolApprovalRequest, signal: AbortSignal): Promise<boolean> {
    return this.enqueue(request, signal, false, (answer) => this.draw(request, answer));
  }

  /** Resolves with one answer list per question, or undefined once the student skips or `signal` aborts. */
  askQuestions(questions: readonly AgentQuestion[], signal: AbortSignal): Promise<QuestionAnswers | undefined> {
    return this.enqueue<QuestionAnswers | undefined>(questions, signal, undefined, (answer) => this.drawQuestions(questions, answer));
  }

  private enqueue<T>(key: object, signal: AbortSignal, cancelled: T, draw: (answer: (value: T) => void) => void): Promise<T> {
    if (signal.aborted) return Promise.resolve(cancelled);
    return new Promise((resolve) => {
      const settle = (value: T): void => {
        if (!this.pending.delete(key)) return;
        signal.removeEventListener('abort', cancel);
        resolve(value);
        this.render();
      };
      const cancel = (): void => settle(cancelled);
      this.pending.set(key, () => draw(settle));
      signal.addEventListener('abort', cancel, { once: true });
      this.render();
    });
  }

  private render(): void {
    const [key, draw] = this.pending.entries().next().value ?? [];
    this.el.hidden = !key;
    if (key !== this.current) {
      this.current = key;
      this.el.empty();
      draw?.();
    }
    this.changed();
  }

  private draw(request: ToolApprovalRequest, answer: (approved: boolean) => void): void {
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
      button.addEventListener('click', () => answer(approved));
    }
  }

  /** One question at a time, so each gets the whole card; Next leads to Submit on the last. */
  private drawQuestions(questions: readonly AgentQuestion[], answer: (answers: QuestionAnswers | undefined) => void): void {
    const form = this.el.createEl('form', { cls: 'clew-question-form' });
    const panes = questions.map((question, index) => {
      const body = form.createDiv({ cls: 'clew-approval-body clew-question', attr: { role: 'group' } });
      const header = body.createDiv({ cls: 'clew-approval-header' });
      setIcon(header.createSpan({ cls: 'clew-approval-icon', attr: { 'aria-hidden': 'true' } }), 'message-circle-question');
      const heading = header.createDiv({ cls: 'clew-question-heading', attr: { id: `clew-question-${crypto.randomUUID()}` } });
      const step = [question.header, questions.length > 1 ? `${index + 1} of ${questions.length}` : ''].filter(Boolean).join(' · ');
      if (step) heading.createDiv({ cls: 'clew-approval-label', text: step });
      heading.createDiv({ cls: 'clew-approval-title', text: question.question });
      body.setAttribute('aria-labelledby', heading.id);

      const list = body.createDiv({ cls: 'clew-question-options' });
      const name = crypto.randomUUID();
      const choices = question.options.map((option) => {
        const label = list.createEl('label', { cls: 'clew-question-option' });
        const input = label.createEl('input', { attr: { type: question.multiSelect ? 'checkbox' : 'radio', name } });
        const text = label.createDiv({ cls: 'clew-question-option-text' });
        text.createDiv({ text: option.label });
        if (option.description) text.createDiv({ cls: 'clew-approval-label', text: option.description });
        return { input, label: option.label };
      });
      const other = question.other ? list.createEl('input', {
        cls: 'clew-question-other',
        attr: { type: question.secret ? 'password' : 'text', placeholder: question.options.length ? 'Something else' : 'Your answer', 'aria-label': question.question },
      }) : undefined;
      if (other && !question.multiSelect) {
        // One answer only: typing replaces a chosen option, and choosing one clears the typed text.
        other.addEventListener('input', () => { if (other.value) for (const choice of choices) choice.input.checked = false; });
        for (const choice of choices) choice.input.addEventListener('change', () => { other.value = ''; });
      }
      const read = (): string[] => [
        ...choices.filter((choice) => choice.input.checked).map((choice) => choice.label),
        ...(other?.value.trim() ? [other.value.trim()] : []),
      ];
      return { body, read, labelId: heading.id };
    });

    const actions = form.createDiv({ cls: 'clew-approval-actions' });
    const skip = actions.createEl('button', { text: 'Skip', cls: 'clew-approval-deny', attr: { type: 'button' } });
    const next = actions.createEl('button', { cls: 'clew-approval-allow', attr: { type: 'submit' } });
    let current = 0;
    const update = (): void => {
      next.setText(current < panes.length - 1 ? 'Next' : 'Submit');
      next.disabled = !panes[current]!.read().length;
    };
    const show = (index: number): void => {
      current = index;
      panes.forEach((pane, i) => { pane.body.hidden = i !== index; });
      this.el.setAttribute('aria-labelledby', panes[index]!.labelId);
      update();
    };
    show(0);
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    // A disabled Submit already blocks submitting an unanswered question, Enter included.
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (current === panes.length - 1) return answer(panes.map((pane) => pane.read()));
      show(current + 1);
      panes[current]!.body.querySelector('input')?.focus();
    });
    skip.addEventListener('click', () => answer(undefined));
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
