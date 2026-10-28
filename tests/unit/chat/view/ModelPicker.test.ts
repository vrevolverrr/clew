/**
 * @jest-environment jsdom
 */
import type { AgentId, ModelOption } from '@/agents/types';
import type { ModelPickerHost } from '@/chat/view/ModelPicker';
import type { ModelChoice } from '@/chat/ChatDefaults';
import { effortMenu, modelMenu, Popover } from '@/chat/view/ModelPicker';

jest.mock('obsidian', () => ({ setIcon: jest.fn() }), { virtual: true });

const MODELS: Record<AgentId, ModelOption[]> = {
  claude: [
    { id: 'opus', name: 'Opus', efforts: ['low', 'high', 'xhigh'], isDefault: false },
    { id: 'sonnet', name: 'Sonnet', efforts: ['low', 'high'], isDefault: true },
  ],
  codex: [{ id: 'gpt-6.1-sol', name: 'Sol', efforts: ['low', 'ultra'], isDefault: true }],
};

describe('model and effort pickers', () => {
  let container: HTMLElement;
  let anchor: HTMLButtonElement;
  let agent: AgentId;
  let choices: Partial<Record<AgentId, ModelChoice>>;
  let chosen: [AgentId, ModelChoice][];
  let host: ModelPickerHost;

  const flush = () => new Promise((resolve) => setTimeout(resolve));
  const menu = () => container.querySelector('.clew-picker-menu:not(.is-closing)');
  const options = (scope = '') => [...menu()!.querySelectorAll(`${scope} .clew-picker-option`)];
  const texts = (els: Element[]) => els.map((el) => el.textContent);
  const checked = (els: Element[]) => texts(els.filter((el) => el.getAttribute('aria-checked') === 'true'));
  const open = async (draw: ReturnType<typeof modelMenu>) => {
    const popover = new Popover(container, anchor, draw);
    popover.toggle();
    await flush();
    return popover;
  };

  beforeEach(() => {
    document.body.empty();
    container = document.body.createDiv();
    anchor = container.createEl('button') as HTMLButtonElement;
    agent = 'claude';
    choices = {};
    chosen = [];
    host = {
      get agent() { return agent; },
      models: async (id) => MODELS[id],
      choice: (id) => choices[id] ?? {},
      choose: async (id, choice) => { chosen.push([id, choice]); },
    };
  });

  it('lists a section per agent, each with Auto naming the default model, then the models', async () => {
    await open(modelMenu(host));

    expect(texts(options('[aria-label="Claude"]'))).toEqual(['AutoSonnet', 'Opus', 'Sonnet']);
    expect(texts(options('[aria-label="GPT"]'))).toEqual(['AutoSol', 'Sol']);
    expect(checked(options())).toEqual(['AutoSonnet']);
    expect(menu()!.querySelectorAll('.clew-picker-heading svg[data-agent]')).toHaveLength(2);
    expect(anchor.getAttribute('aria-expanded')).toBe('true');
  });

  it('picks a model of either agent, keeping an effort only if that model takes it, and closes', async () => {
    choices = { claude: { model: 'opus', name: 'Opus', effort: 'xhigh' }, codex: { effort: 'ultra' } };

    await open(modelMenu(host));
    expect(checked(options())).toEqual(['Opus']);
    (options('[aria-label="Claude"]')[2] as HTMLElement).click();
    expect(chosen).toEqual([['claude', { model: 'sonnet', name: 'Sonnet', effort: undefined }]]);
    expect(menu()).toBeNull();

    await open(modelMenu(host));
    (options('[aria-label="GPT"]')[1] as HTMLElement).click();
    expect(chosen[1]).toEqual(['codex', { model: 'gpt-6.1-sol', name: 'Sol', effort: 'ultra' }]);
  });

  it('offers Auto and the chosen model\'s efforts, falling back to the default model\'s, and picks one', async () => {
    const first = await open(effortMenu(host));
    expect(texts(options())).toEqual(['Auto', 'Low', 'High']);
    expect(checked(options())).toEqual(['Auto']);
    first.close();

    choices.claude = { model: 'opus', name: 'Opus' };
    await open(effortMenu(host));
    expect(texts(options())).toEqual(['Auto', 'Low', 'High', 'Extra high']);
    (options()[3] as HTMLElement).click();
    expect(chosen).toEqual([['claude', { model: 'opus', name: 'Opus', effort: 'xhigh' }]]);
    expect(menu()).toBeNull();
  });

  it('finds the model of a saved choice by its family when that version is no longer listed', async () => {
    host = { ...host, models: async () => [
      { id: 'opus', name: 'Opus', efforts: ['low', 'xhigh'], isDefault: true },
      { id: 'sonnet-5-5', name: 'Sonnet', efforts: ['low'], isDefault: false },
    ] };
    choices.claude = { model: 'sonnet-4', name: 'Sonnet' };

    await open(effortMenu(host));

    expect(texts(options())).toEqual(['Auto', 'Low']);
  });

  it('closes on a click outside it', async () => {
    await open(effortMenu(host));

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu()).toBeNull();
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
  });
});
