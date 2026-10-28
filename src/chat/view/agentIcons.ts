import { isAgentId, PROVIDERS, type ProviderInfo } from '@/agents/providers';
import type { AgentId } from '@/agents/types';

const FALLBACK = { viewBox: '0 0 24 24', path: 'M3 3h18v14H9l-6 5V3Zm2 2v12.7L8.3 15H19V5H5Z' };
const SVG = 'http://www.w3.org/2000/svg';

/** Appends the agent's logo, or a generic one for an agent without artwork. */
export function appendAgentIcon(parent: HTMLElement, agent: AgentId): void {
  const info: ProviderInfo | undefined = isAgentId(agent) ? PROVIDERS[agent] : undefined;
  const icon: NonNullable<ProviderInfo['icon']> = info?.icon ?? FALLBACK;
  const svg = parent.appendChild(document.createElementNS(SVG, 'svg'));
  svg.classList.add('clew-agent-icon');
  svg.setAttribute('viewBox', icon.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-agent', agent);
  if (icon.color) svg.style.setProperty('--clew-agent-color', icon.color);
  const path = svg.appendChild(document.createElementNS(SVG, 'path'));
  path.setAttribute('d', icon.path);
  path.setAttribute('fill', 'currentColor');
}
