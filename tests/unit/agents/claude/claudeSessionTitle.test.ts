import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { claudeSessionTitle } from '@/agents/claude/claudeSessionTitle';

const ID = '8d98ab31-abf1-47e4-b458-4f1855021eaf';

let configDir: string;

beforeEach(() => {
  configDir = mkdtempSync(path.join(tmpdir(), 'clew-claude-config-'));
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

function transcript(folder: string, lines: object[], id = ID): void {
  mkdirSync(path.join(configDir, 'projects', folder), { recursive: true });
  writeFileSync(path.join(configDir, 'projects', folder, `${id}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
}

describe('claudeSessionTitle', () => {
  it('finds the conversation in whichever project folder holds it', async () => {
    transcript('-vault-a', [{ type: 'ai-title', aiTitle: 'Other chat' }], 'other');
    transcript('-vault-b', [{ type: 'user', message: { content: 'Hi' } }, { type: 'ai-title', aiTitle: 'Photosynthesis light reactions', sessionId: ID }]);

    expect(await claudeSessionTitle(ID, configDir)).toBe('Photosynthesis light reactions');
  });

  it('takes the latest generated title', async () => {
    transcript('-vault', [{ type: 'ai-title', aiTitle: 'First guess' }, { type: 'ai-title', aiTitle: 'Better guess' }]);

    expect(await claudeSessionTitle(ID, configDir)).toBe('Better guess');
  });

  it('prefers the title the student set with /rename', async () => {
    transcript('-vault', [{ type: 'ai-title', aiTitle: 'Generated' }, { type: 'custom-title', customTitle: 'My name' }, { type: 'ai-title', aiTitle: 'Generated again' }]);

    expect(await claudeSessionTitle(ID, configDir)).toBe('My name');
  });

  it('has no title before the CLI wrote one, even when a message mentions the key', async () => {
    transcript('-vault', [{ type: 'user', message: { content: 'what is "aiTitle"?' } }]);

    expect(await claudeSessionTitle(ID, configDir)).toBeUndefined();
  });

  it('skips a line cut short by a write in progress', async () => {
    transcript('-vault', [{ type: 'ai-title', aiTitle: 'Kept' }]);
    writeFileSync(path.join(configDir, 'projects', '-vault', `${ID}.jsonl`), '{"type":"ai-title","aiTitle":"Kept"}\n{"type":"ai-title","aiTi');

    expect(await claudeSessionTitle(ID, configDir)).toBe('Kept');
  });

  it('has no title for a conversation the CLI never saved or a missing config folder', async () => {
    expect(await claudeSessionTitle(ID, configDir)).toBeUndefined();
    expect(await claudeSessionTitle(ID, path.join(configDir, 'nowhere'))).toBeUndefined();
  });
});
