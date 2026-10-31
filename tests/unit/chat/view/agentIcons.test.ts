/** @jest-environment jsdom */
import type { AgentId } from '@/agents/types';
import { appendAgentIcon } from '@/chat/view/agentIcons';

it('uses a generic icon for a provider without custom artwork', () => {
  const host = document.createElement('div');
  // Simulate a newly registered provider before custom UI artwork is added.
  appendAgentIcon(host, 'unbranded' as AgentId);
  const icon = host.querySelector('svg')!;
  expect(icon.classList.contains('clew-agent-icon')).toBe(true);
  expect(icon.getAttribute('data-agent')).toBe('unbranded');
  expect(icon.getAttribute('aria-hidden')).toBe('true');
  expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
  const claude = document.createElement('div');
  appendAgentIcon(claude, 'claude');
  expect(icon.querySelector('path')?.getAttribute('d')).not.toBe(claude.querySelector('path')!.getAttribute('d'));
});
