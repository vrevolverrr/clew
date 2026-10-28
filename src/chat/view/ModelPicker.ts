import { setIcon } from '@/shared/view/icon';

import { type AgentId, type Effort, type ModelOption, PERMISSION_POLICIES, type PermissionPolicy } from '@/agents/types';
import { AGENT_IDS, PROVIDERS } from '@/agents/providers';
import { appendAgentIcon } from '@/chat/view/agentIcons';
import type { ModelChoice } from '@/chat/ChatDefaults';
import { dismissOnOutside, menuLabelId, removeMenu } from '@/chat/view/menuDismiss';

export interface ModelPickerHost {
  readonly agent: AgentId;
  models(agent: AgentId): Promise<ModelOption[]>;
  choice(agent: AgentId): ModelChoice;
  /** Saves the choice for `agent`, switching the chat to that agent first if needed. */
  choose(agent: AgentId, choice: ModelChoice): Promise<void>;
}

export interface PermissionMenuHost {
  readonly permissionPolicy: PermissionPolicy;
  choosePermission(policy: PermissionPolicy): Promise<void>;
}

const POLICY_NAMES: Record<PermissionPolicy, string> = { inherit: 'Inherit', auto: 'Auto', approval: 'Approval', bypass: 'Bypass' };
const DESCRIPTIONS: Record<PermissionPolicy, string> = {
  inherit: "Use the agent's own permission settings",
  auto: 'Let the agent review eligible actions automatically',
  approval: 'Ask you when the agent requires permission',
  bypass: 'Skip approvals and any sandbox the agent runs in',
};

const GAP = 6;

type Draw = (popover: HTMLElement, close: () => void) => void | Promise<void>;

/** A menu that opens above its anchor in the composer. Picking closes it, as do Escape and a click outside. */
export class Popover {
  private popover: HTMLElement | null = null;
  private unwatch: (() => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly anchor: HTMLElement,
    private readonly draw: Draw,
  ) {
    anchor.setAttr('aria-haspopup', 'menu');
    anchor.setAttr('aria-expanded', 'false');
  }

  toggle(): void {
    if (this.popover) this.close();
    else this.open();
  }

  readonly close = (): void => {
    const popover = this.popover;
    if (!popover) return;
    this.popover = null;
    this.anchor.setAttr('aria-expanded', 'false');
    this.unwatch?.();
    this.unwatch = null;
    removeMenu(popover);
  };

  private open(): void {
    const popover = this.container.createDiv({ cls: 'clew-picker-menu', attr: { role: 'menu', 'aria-labelledby': menuLabelId(this.anchor) } });
    popover.style.left = `${this.anchor.offsetLeft}px`;
    popover.style.bottom = `${this.container.clientHeight - this.anchor.offsetTop + GAP}px`;
    this.popover = popover;
    this.anchor.setAttr('aria-expanded', 'true');
    this.unwatch = dismissOnOutside(this.anchor, popover, this.close);
    void this.draw(popover, this.close);
  }
}

/** One section of models per agent; picking a model of the other agent switches the chat to it. */
export function modelMenu(host: ModelPickerHost): Draw {
  return async (popover, close) => {
    const lists = new Map<AgentId, ModelOption[]>();
    const draw = (): void => {
      popover.empty();
      const current = host.agent;
      for (const agent of AGENT_IDS) {
        const section = popover.createDiv({ cls: 'clew-picker-section', attr: { role: 'group', 'aria-label': PROVIDERS[agent].modelLabel } });
        const heading = section.createDiv({ cls: 'clew-picker-heading' });
        appendAgentIcon(heading, agent);
        heading.createSpan({ text: PROVIDERS[agent].modelLabel });

        const models = lists.get(agent);
        if (!models) {
          section.createDiv({ cls: 'clew-picker-loading', text: 'Loading models…' });
          continue;
        }
        const choice = host.choice(agent);
        const auto = models.find((model) => model.isDefault);
        const pick = (next: ModelChoice) => (): void => {
          close();
          void host.choose(agent, next);
        };
        option(section, 'Auto', auto?.name, agent === current && !choice.model, pick({ effort: keptEffort(choice.effort, auto) }));
        for (const model of models) {
          option(section, model.name, undefined, agent === current && model.id === choice.model,
            pick({ model: model.id, name: model.name, effort: keptEffort(choice.effort, model) }));
        }
      }
    };
    draw();
    await Promise.all(AGENT_IDS.map(async (agent) => lists.set(agent, await host.models(agent))));
    draw();
  };
}

/** Auto, then the levels the current model takes. */
export function effortMenu(host: ModelPickerHost): Draw {
  return async (popover, close) => {
    const agent = host.agent;
    const models = await host.models(agent);
    const choice = host.choice(agent);
    const model = models.find((option) => option.id === choice.model)
      ?? models.find((option) => option.name === choice.name)
      ?? models.find((option) => option.isDefault);
    for (const effort of [undefined, ...model?.efforts ?? []]) {
      option(popover, effort ? effortName(effort) : 'Auto', undefined, effort === choice.effort, () => {
        close();
        void host.choose(agent, { ...choice, effort });
      });
    }
  };
}

/** The model, effort and permission buttons; `update` redraws their labels from the host. */
export function pickerBar(bar: HTMLElement, container: HTMLElement, host: ModelPickerHost & PermissionMenuHost): { update(): void; close(): void } {
  const popovers: Popover[] = [];
  const button = (draw: Draw): HTMLElement => {
    const el = bar.createEl('button', { cls: 'clew-picker', attr: { type: 'button' } });
    const label = el.createSpan({ cls: 'clew-picker-label' });
    setIcon(el.createSpan({ cls: 'clew-picker-chevron' }), 'chevron-down');
    const popover = new Popover(container, el, draw);
    popovers.push(popover);
    el.addEventListener('click', () => {
      for (const other of popovers) if (other !== popover) other.close();
      popover.toggle();
    });
    return label;
  };
  const modelEl = button(modelMenu(host));
  const effortEl = button(effortMenu(host));
  const permissionEl = button(permissionMenu(host));
  permissionEl.parentElement!.addClass('clew-permission-picker');
  permissionEl.parentElement!.setAttr('aria-label', 'Permission policy');
  const update = (): void => {
    const agent = host.agent;
    const { name, effort } = host.choice(agent);
    modelEl.empty();
    appendAgentIcon(modelEl, agent);
    modelEl.createSpan({ text: name ?? 'Auto' });
    effortEl.empty();
    setIcon(effortEl.createSpan({ cls: 'clew-picker-icon' }), 'gauge');
    effortEl.createSpan({ text: effort ? effortName(effort) : 'Auto' });
    permissionEl.empty();
    setIcon(permissionEl.createSpan({ cls: 'clew-picker-icon' }), 'shield');
    const permission = POLICY_NAMES[host.permissionPolicy];
    permissionEl.createSpan({ text: permission });
    permissionEl.parentElement!.setAttr('title', `Permission policy: ${permission} (changes apply next turn)`);
  };
  update();
  return { update, close: () => popovers.forEach((popover) => popover.close()) };
}

export function permissionMenu(host: PermissionMenuHost): Draw {
  return (parent, close) => {
    for (const policy of PERMISSION_POLICIES) {
      option(parent, POLICY_NAMES[policy], undefined, host.permissionPolicy === policy, () => {
        close();
        void host.choosePermission(policy);
      }, DESCRIPTIONS[policy]);
    }
  };
}

function option(parent: HTMLElement, name: string, detail: string | undefined, selected: boolean, onClick: () => void, title?: string): void {
  const button = parent.createEl('button', {
    cls: 'clew-picker-option',
    attr: { type: 'button', role: 'menuitemradio', 'aria-checked': String(selected), ...(title ? { title } : {}) },
  });
  button.createSpan({ cls: 'clew-picker-option-label', text: name });
  if (detail) button.createSpan({ cls: 'clew-picker-option-detail', text: detail });
  if (selected) setIcon(button.createSpan({ cls: 'clew-picker-check' }), 'check');
  button.addEventListener('click', onClick);
}

/** The effort if the model takes it, else the model's own default. */
function keptEffort(effort: Effort | undefined, model: ModelOption | undefined): Effort | undefined {
  return effort && model?.efforts.includes(effort) ? effort : undefined;
}

function effortName(effort: Effort): string {
  return effort === 'xhigh' ? 'Extra high' : effort.charAt(0).toUpperCase() + effort.slice(1);
}
