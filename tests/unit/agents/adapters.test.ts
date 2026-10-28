import { displayCommand, displayPath, latestPerFamily } from '@/agents/adapters';

describe('displayPath', () => {
  it('shows a vault file relative to the vault', () => {
    expect(displayPath('/vault/notes/ch11.md', '/vault')).toBe('notes/ch11.md');
  });

  it('shows a file outside the vault by its name', () => {
    expect(displayPath('/private/tmp/notes.md', '/vault')).toBe('notes.md');
  });
});

describe('displayCommand', () => {
  it('drops the vault path from a command', () => {
    expect(displayCommand('ls -1 "/vault/notes/" && wc -l "/vault/a.md"', '/vault')).toBe('ls -1 "notes/" && wc -l "a.md"');
  });
});

const model = (id: string, name: string, version: string) => ({ id, name, version, efforts: [] });

describe('latestPerFamily', () => {
  it('keeps the highest version of each family, compared as numbers, in first-seen order', () => {
    const models = [
      model('sol-6.1', 'Sol', '6.1'),
      model('luna-6', 'Luna', '6'),
      model('sol-6.10', 'Sol', '6.10'),
      model('luna-5.6', 'Luna', '5.6'),
    ];

    expect(latestPerFamily(models, undefined).map((m) => m.id)).toEqual(['sol-6.10', 'luna-6']);
  });

  it('keeps the first of two equal versions, so an alias wins over its pinned id', () => {
    const models = [model('haiku', 'Haiku', '5.5'), model('claude-haiku-5-5', 'Haiku', '5.5')];

    expect(latestPerFamily(models, undefined).map((m) => m.id)).toEqual(['haiku']);
  });

  it('marks the family of the default model, even when the default is an older version', () => {
    const models = [model('sonnet', 'Sonnet', '5.5'), model('opus', 'Opus', '5.5'), model('claude-sonnet-5', 'Sonnet', '5')];

    expect(latestPerFamily(models, 'claude-sonnet-5').filter((m) => m.isDefault).map((m) => m.id)).toEqual(['sonnet']);
  });
});
