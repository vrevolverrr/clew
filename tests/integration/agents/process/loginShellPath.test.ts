import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

const describeUnix = process.platform === 'win32' ? describe.skip : describe;

describeUnix('login shell PATH for GUI-launched processes', () => {
  const originalEnv = process.env;
  let directory: string;
  let loginBin: string;

  beforeEach(() => {
    jest.resetModules();
    directory = mkdtempSync(path.join(tmpdir(), 'clew login shell '));
    loginBin = path.join(directory, 'login only bin');
    mkdirSync(loginBin);
    const cli = path.join(loginBin, 'clew-login-probe');
    writeFileSync(cli, '#!/bin/sh\necho ok\n');
    chmodSync(cli, 0o755);
    // Mirrors a GUI app: minimal PATH, and an empty home so no guessed location holds the CLI.
    process.env = { ...originalEnv, HOME: directory, PATH: '/usr/bin:/bin' };
    for (const key of ['FNM_DIR', 'FNM_MULTISHELL_PATH', 'NVM_BIN', 'VOLTA_HOME', 'XDG_DATA_HOME']) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(directory, { recursive: true, force: true });
  });

  function writeShell(body: string): void {
    const shell = path.join(directory, 'fake shell');
    writeFileSync(shell, `#!/bin/sh\n${body}\n`);
    chmodSync(shell, 0o755);
    process.env.SHELL = shell;
  }

  /** A profile that prints noise and exports a PATH only the login shell knows. */
  function writeLoginShell(): void {
    writeShell([
      'echo "profile noise $PATH"',
      'for last; do :; done',
      `PATH='${loginBin}:/usr/bin:/bin'; export PATH`,
      'eval "$last"',
    ].join('\n'));
  }

  async function resolveProbeCliPath(): Promise<string | null> {
    const { resolveLoginShellPath } = await import('@/agents/process/loginShellPath');
    const { findCLIBinaryPath } = await import('@/agents/process/cliBinaryLocator');
    await resolveLoginShellPath();
    return findCLIBinaryPath('clew-login-probe');
  }

  it('resolves provider CLIs and child PATH from the login shell before launch', async () => {
    writeLoginShell();

    await expect(resolveProbeCliPath())
      .resolves.toBe(path.join(loginBin, 'clew-login-probe'));

    const { getEnhancedPath } = await import('@/agents/process/env');
    const entries = getEnhancedPath().split(path.delimiter);
    expect(entries[0]).toBe(loginBin);
    expect(entries.some(entry => entry.includes('profile noise'))).toBe(false);
  });

  it('falls back to guessed locations when the login shell fails', async () => {
    writeShell('echo broken >&2\nexit 1');

    await expect(resolveProbeCliPath()).resolves.toBeNull();
    const { getEnhancedPath } = await import('@/agents/process/env');
    expect(getEnhancedPath().split(path.delimiter)).toContain(path.join(directory, '.local', 'bin'));
  });
});
