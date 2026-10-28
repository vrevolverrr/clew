import * as path from 'node:path';

import { ClaudeAgent } from '@/agents/claude/ClaudeAgent';

const FAKE_CLAUDE = path.join(__dirname, '../../../fixtures/claude/fakeClaude.mjs');

afterEach(() => {
  delete process.env.FAKE_CLAUDE_LOGGED_IN;
});

describe('ClaudeAgent auth state', () => {
  it('reports logged-in when `claude auth status` says so', async () => {
    process.env.FAKE_CLAUDE_LOGGED_IN = '1';

    await expect(new ClaudeAgent().authState(FAKE_CLAUDE)).resolves.toBe('logged-in');
  });

  it('reports logged-out when `claude auth status` exits non-zero', async () => {
    process.env.FAKE_CLAUDE_LOGGED_IN = '0';

    await expect(new ClaudeAgent().authState(FAKE_CLAUDE)).resolves.toBe('logged-out');
  });
});
