import { ChatDefaults } from '@/chat/ChatDefaults';

function selection(saved: unknown) {
  const save = jest.fn(async () => undefined);
  return { save, selection: new ChatDefaults(saved, save) };
}

describe('ChatDefaults', () => {
  it('starts on Claude Code with no choices when nothing was saved', () => {
    const { selection: empty } = selection(null);
    expect(empty.agent).toBe('claude');
    expect(empty.choice('codex')).toEqual({});
  });

  it('reads back what it saved and ignores what is not a choice', () => {
    const { selection: restored } = selection({ agent: 'codex', choices: { claude: { model: 'm', name: 'Sonnet', effort: 'low' }, codex: 4 } });
    expect(restored.agent).toBe('codex');
    expect(restored.choice('claude')).toEqual({ model: 'm', name: 'Sonnet', effort: 'low' });
    expect(restored.choice('codex')).toEqual({});
  });

  it('refuses an agent it does not know', () => {
    expect(selection({ agent: 'gemini' }).selection.agent).toBe('claude');
  });

  it('saves the agent and every choice whenever one changes', async () => {
    const { selection: changing, save } = selection(null);
    await changing.setChoice('claude', { model: 'm' });
    await changing.setAgent('codex');
    expect(save).toHaveBeenLastCalledWith({ agent: 'codex', choices: { claude: { model: 'm' } } });
  });
});
