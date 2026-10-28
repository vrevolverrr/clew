import { type App, type Plugin, PluginSettingTab, Setting } from 'obsidian';

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

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const providers = AGENT_IDS.map((id) => PROVIDERS[id]);

    new Setting(containerEl).setName('Environment').setHeading();
    const setting = new Setting(containerEl)
      .setClass('clew-env-setting')
      .setName('Environment variables')
      .setDesc(
        `One NAME=value per line, added to ${providers.map(({ name }) => name).join(' and ')} when a chat starts, such as ${providers.map(({ apiKey }) => apiKey).join(' or ')}. `
        + 'Lines starting with # are ignored. The text is kept in Obsidian\'s secret storage, not in this vault\'s plugin files. '
        + 'Saving restarts the agent in open chats, and each chat keeps its conversation. With an API key set, the agent may bill that key instead of your subscription.',
      );
    const problems = containerEl.createDiv({ cls: 'clew-env-problems' });
    const showProblems = (text: string): void => {
      const { invalid } = parseEnv(text);
      problems.setText(invalid.length ? `Ignored lines: ${invalid.join(', ')}` : '');
    };

    setting.addTextArea((area) => {
      area.setPlaceholder(`${PROVIDERS[DEFAULT_AGENT].apiKey}=...`).setValue(this.env.text).onChange(showProblems);
      area.inputEl.rows = 8;
      area.inputEl.spellcheck = false;
      // Saved when the field loses focus, not on every keystroke.
      area.inputEl.addEventListener('change', () => this.env.set(area.getValue()));
      showProblems(area.getValue());
    });
  }
}
