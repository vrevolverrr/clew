import { setIcon } from '@/shared/view/icon';

import type { ToolStatus } from '@/agents/types';
import type { ToolPart } from '@/chat/ChatRecord';

/** A run of tool calls with no text between them: one summary line that expands to a row per call. */
export class ToolGroup {
  private readonly rows = new Map<string, { el: HTMLElement; name: string; status: ToolStatus }>();
  private readonly summaryEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly startedAt = Date.now();
  private readonly phraseOffset = Math.floor(Math.random() * WORKING_PHRASES.length);
  private settledAt: number | null = null;
  private ticker: number | null = null;
  private finished = false;

  constructor(private readonly el: HTMLElement) {
    const header = el.createEl('button', { cls: 'clew-tools-header', attr: { 'aria-expanded': 'false' } });
    header.createSpan({ cls: 'clew-tools-orb', attr: { 'aria-hidden': 'true' } });
    this.summaryEl = header.createSpan({ cls: 'clew-tools-summary' });
    this.timeEl = header.createSpan({ cls: 'clew-tools-time' });
    setIcon(header.createSpan({ cls: 'clew-tools-chevron' }), 'chevron-right');
    header.addEventListener('click', () => {
      if (this.isEmpty()) return;
      const open = !el.hasClass('is-open');
      el.toggleClass('is-open', open);
      header.setAttr('aria-expanded', String(open));
    });
    this.listEl = el.createDiv({ cls: 'clew-tools-list' });
    this.renderSummary();
  }

  has(id: string): boolean {
    return this.rows.has(id);
  }

  isEmpty(): boolean {
    return this.rows.size === 0;
  }

  isRunning(): boolean {
    return [...this.rows.values()].some((row) => row.status === 'running');
  }

  /** Whole seconds the group has been active, held once it settles. */
  seconds(): number {
    return Math.floor(((this.settledAt ?? Date.now()) - this.startedAt) / 1000);
  }

  remove(): void {
    this.track(false);
    this.el.remove();
  }

  set({ id, name, title, status }: ToolPart): void {
    const el = this.rows.get(id)?.el ?? this.listEl.createDiv({ cls: 'clew-tool' });
    this.rows.set(id, { el, name: DISPLAY_NAMES[name] ?? name, status });
    el.setText(title);
    el.setAttr('data-status', status);
    this.renderSummary();
  }

  finish(): void {
    this.finished = true;
    this.renderSummary();
  }

  private renderSummary(): void {
    const rows = [...this.rows.values()];
    const running = rows.filter((row) => row.status === 'running');
    const empty = rows.length === 0;
    const active = !this.finished && (empty || running.length > 0);
    this.el.toggleClass('is-running', active);
    this.el.toggleClass('is-empty', empty);
    this.track(active);
    const seconds = this.seconds();
    this.timeEl.setText(seconds < 1 || (empty && !active) ? '' : formatElapsed(seconds));
    if (empty) {
      const turn = Math.floor((Date.now() - this.startedAt) / PHRASE_MS);
      this.summaryEl.setText(active
        ? WORKING_PHRASES[(this.phraseOffset + turn) % WORKING_PHRASES.length]!
        : `Thought for ${formatElapsed(seconds)}`);
      return;
    }
    if (active) {
      this.summaryEl.setText(`Using ${[...new Set(running.map((row) => row.name))].join(', ')}`);
      return;
    }
    const failed = rows.filter((row) => row.status === 'failed').length;
    this.summaryEl.setText(`Used ${countByName(rows.map((row) => row.name))}${failed ? ` (${failed} failed)` : ''}`);
  }

  /** Ticks while the group is active, and holds its end time once it settles. */
  private track(active: boolean): void {
    if (active) {
      this.settledAt = null;
      this.ticker ??= window.setInterval(() => this.renderSummary(), 1000);
    } else {
      this.settledAt ??= Date.now();
      if (this.ticker !== null) window.clearInterval(this.ticker);
      this.ticker = null;
    }
  }
}

const DISPLAY_NAMES: Record<string, string> = { load_pack: 'visual pack' };

const PHRASE_MS = 4000;

const WORKING_PHRASES = [
  'Following the thread',
  'Reading your note',
  'Tracing the backlinks',
  'Checking the margins',
  'Leafing through the vault',
  'Untangling the knot',
  'Gathering the threads',
  'Sketching it out',
  'Cross-referencing',
  'Working through it',
];

function formatElapsed(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const NAMED_KINDS = 3;

/** "1 Bash, 2 Reads, and 3 other": the most-used kinds by name, the rest as one count. */
function countByName(names: string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const kinds = [...counts].sort((a, b) => b[1] - a[1]);
  const named = kinds.length > NAMED_KINDS ? kinds.slice(0, NAMED_KINDS - 1) : kinds;
  const parts = named.map(([name, count]) => `${count} ${count === 1 || /[shx]$/.test(name) ? name : `${name}s`}`);
  const other = kinds.slice(named.length).reduce((sum, [, count]) => sum + count, 0);
  if (other) parts.push(`${other} other`);
  return parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}
