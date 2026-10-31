import { type App, type Plugin, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';

import { AGENT_IDS, DEFAULT_AGENT, PROVIDERS } from '@/agents/providers';
import { parseEnv, UserEnv } from '@/settings/UserEnv';

/** The secret in Obsidian's secret storage that holds the environment variables' text. */
const SECRET = 'clew-environment';

export function obsidianUserEnv(app: App, onChange: () => void): UserEnv {
  return new UserEnv(() => app.secretStorage.getSecret(SECRET), (text) => app.secretStorage.setSecret(SECRET, text), onChange);
}

/** Clew's settings page. */
export class ClewSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin, private readonly env: UserEnv) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const providers = AGENT_IDS.map((id) => PROVIDERS[id]);
    return [{
      type: 'group',
      heading: 'Environment',
      items: [{
        name: 'Environment variables',
        desc: `One NAME=value per line, added to ${providers.map(({ name }) => name).join(' and ')} when a chat starts, such as ${providers.map(({ apiKey }) => apiKey).join(' or ')}. `
          + 'Lines starting with # are ignored. The text is kept in Obsidian\'s secret storage, not in this vault\'s plugin files. '
          + 'Saving restarts the agent in open chats, and each chat keeps its conversation. With an API key set, the agent may bill that key instead of your subscription.',
        render: (setting) => {
          setting.setClass('clew-env-setting');
          setting.addTextArea((area) => {
            area.setPlaceholder(`${PROVIDERS[DEFAULT_AGENT].apiKey}=...`).setValue(this.env.text).onChange(showProblems);
            area.inputEl.rows = 8;
            area.inputEl.spellcheck = false;
            // Saved when the field loses focus, not on every keystroke.
            area.inputEl.addEventListener('change', () => this.env.set(area.getValue()));
          });
          const problems = setting.settingEl.createDiv({ cls: 'clew-env-problems' });
          function showProblems(text: string): void {
            const { invalid } = parseEnv(text);
            problems.setText(invalid.length ? `Ignored lines: ${invalid.join(', ')}` : '');
          }
          showProblems(this.env.text);
        },
      }],
    }];
  }
}
