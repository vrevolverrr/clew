/** @jest-environment jsdom */
import type { ToolApprovalRequest } from '@/agents/types';
import { ApprovalCard } from '@/chat/view/ApprovalCard';

jest.mock('obsidian', () => ({ setIcon: jest.fn() }), { virtual: true });

const request = (): ToolApprovalRequest => ({
  description: 'these file changes', input: { path: '<img src=x onerror=alert(1)>', old: 'before', new: 'after' },
  fields: [{ kind: 'path', value: '<img src=x onerror=alert(1)>' }], changes: [],
});

it('shows plain-text details and exactly Deny and Allow once buttons', async () => {
  const host = document.createElement('div');
  const card = new ApprovalCard(host, () => undefined);
  const answer = card.ask(request(), new AbortController().signal);
  expect(host.querySelector('img')).toBeNull();
  expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  const region = host.querySelector('.clew-approval-card')!;
  expect(region.hasAttribute('aria-label')).toBe(false);
  expect(region.getAttribute('aria-labelledby')).toBe(host.querySelector('.clew-approval-title')!.id);
  const buttons = host.querySelectorAll('button');
  expect([...buttons].map((button) => button.textContent)).toEqual(['Deny', 'Allow once']);
  expect(host.querySelector('.clew-approval-card > .clew-approval-actions')?.contains(buttons[0]!)).toBe(true);
  expect(host.querySelector('.clew-approval-body')?.contains(buttons[0]!)).toBe(false);
  buttons[1]!.click();
  expect(await answer).toBe(true);
  expect(host.querySelector<HTMLElement>('.clew-approval-card')!.hidden).toBe(true);
});

it('renders normalized command fields and keeps the opaque original input available', () => {
  const host = document.createElement('div');
  const card = new ApprovalCard(host, () => undefined);
  const controller = new AbortController();
  const input = { unfamiliar: 'opaque native request', command: 'not the displayed command' };
  void card.ask({
    description: 'this command', input, decisionReason: 'Check connectivity', changes: [],
    fields: [{ kind: 'command', value: 'curl https://example.com' }, { kind: 'cwd', value: '/vault' }],
  }, controller.signal);
  expect(host.querySelector('.clew-approval-title')?.textContent).toBe('Allow this command?');
  expect(host.querySelector('.clew-approval-reason')?.textContent).toBe('Check connectivity');
  expect([...host.querySelectorAll('.clew-approval-value')].map((el) => el.textContent)).toEqual(['curl https://example.com', '/vault']);
  expect(host.querySelector('details')!.open).toBe(false);
  expect(host.querySelector('.clew-approval-details')?.textContent).toBe(JSON.stringify(input, null, 2));
  controller.abort();
});

it('shows unfamiliar tool inputs expanded and does not interpret markup in any field', () => {
  const host = document.createElement('div');
  const card = new ApprovalCard(host, () => undefined);
  const controller = new AbortController();
  void card.ask({ description: '<img src=x>', decisionReason: '<script>alert(1)</script>', input: { custom: '<svg onload=alert(1)>' }, fields: [], changes: [] }, controller.signal);
  expect(host.querySelector('details')!.open).toBe(true);
  expect(host.querySelector('img, script, svg')).toBeNull();
  expect(host.textContent).toContain('<svg onload=alert(1)>');
  controller.abort();
});

it('shows normalized file changes as inline edits with one decision for the whole request', () => {
  const host = document.createElement('div');
  const card = new ApprovalCard(host, () => undefined);
  const controller = new AbortController();
  const input = { unfamiliar: 'original native request' };
  void card.ask({ description: 'these file changes', input, fields: [], changes: [
    { path: '<img src=x>.md', kind: 'update', blocks: [{ before: 'The dashboard is available.\n', after: 'The dashboard is live.\n' }] },
    { path: 'new.md', kind: 'add', blocks: [{ before: '', after: '<script>alert(1)</script>' }] },
  ] }, controller.signal);
  expect(host.querySelectorAll('.clew-approval-diff')).toHaveLength(2);
  expect(host.querySelector('del')?.textContent).toBe('available');
  expect(host.querySelector('ins')?.textContent).toBe('live');
  expect(host.querySelector('.clew-approval-diff-text > span')?.textContent).toBe('The dashboard is ');
  expect(host.querySelector('img, script')).toBeNull();
  expect(host.textContent).toContain('<script>alert(1)</script>');
  expect(host.querySelectorAll('button')).toHaveLength(2);
  expect(host.querySelector('details')!.open).toBe(false);
  expect(host.querySelector('.clew-approval-details')?.textContent).toBe(JSON.stringify(input, null, 2));
  controller.abort();
});

it('renders proposed contents without inventing old text', () => {
  const host = document.createElement('div');
  const card = new ApprovalCard(host, () => undefined);
  const controller = new AbortController();
  void card.ask({ description: 'writing this file', input: {}, fields: [], changes: [
    { path: 'note.md', kind: 'write', note: 'Proposed contents; previous contents were not supplied.', blocks: [{ text: 'Proposed text' }] },
  ] }, controller.signal);
  expect(host.querySelector('.clew-approval-diff-note')?.textContent).toContain('previous contents were not supplied');
  expect(host.querySelector('del, ins')).toBeNull();
  expect(host.querySelector('.clew-approval-diff-text')?.textContent).toBe('Proposed text');
  controller.abort();
});

it('renders a normalized fallback field without attempting to parse its input', () => {
  const host = document.createElement('div');
  const card = new ApprovalCard(host, () => undefined);
  const controller = new AbortController();
  const changes = [{ path: 'a.md', diff: '-before\n+after' }, { path: 'b.md', unsupported: 'keep this visible' }];
  void card.ask({ description: 'these file changes', input: { changes }, changes: [], fields: [{ kind: 'changes', value: JSON.stringify(changes, null, 2) }] }, controller.signal);
  expect(host.querySelector('.clew-approval-diff')).toBeNull();
  expect(host.querySelector('.clew-approval-value')?.textContent).toBe(JSON.stringify(changes, null, 2));
  controller.abort();
});

it('queues concurrent requests and prevents old buttons from answering the next request', async () => {
  const host = document.createElement('div');
  const card = new ApprovalCard(host, () => undefined);
  const first = card.ask(request(), new AbortController().signal);
  const stale = host.querySelectorAll('button')[1]!;
  const second = card.ask(request(), new AbortController().signal);
  stale.click();
  expect(await first).toBe(true);
  stale.click();
  expect(card.size).toBe(1);
  host.querySelector('button')!.click();
  expect(await second).toBe(false);
});

it('drops a request when its signal aborts', async () => {
  const host = document.createElement('div');
  const changed = jest.fn();
  const card = new ApprovalCard(host, changed);
  const controller = new AbortController();
  const first = card.ask(request(), controller.signal);
  controller.abort();
  expect(await first).toBe(false);
  expect(host.querySelector<HTMLElement>('.clew-approval-card')!.hidden).toBe(true);
  expect(card.size).toBe(0);
  expect(changed).toHaveBeenCalledTimes(2);
  expect(await card.ask(request(), AbortSignal.abort())).toBe(false);
});
