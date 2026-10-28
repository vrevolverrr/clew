import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  findCodexBinaryPath,
} from '@/agents/codex/CodexBinaryLocator';

describe('CodexBinaryLocator', () => {
  let tempDir: string;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const originalEnvironment = {
    CODEX_INSTALL_DIR: process.env.CODEX_INSTALL_DIR,
    HOME: process.env.HOME,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    PATH: process.env.PATH,
    USERPROFILE: process.env.USERPROFILE,
  };

  function restoreEnvironmentVariable(
    name: keyof typeof originalEnvironment,
  ): void {
    const value = originalEnvironment[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value: platform });
  }

  function createCompleteWindowsCodexRuntime(dir: string): string {
    fs.mkdirSync(dir, { recursive: true });
    const cliPath = path.join(dir, 'codex.exe');
    fs.writeFileSync(cliPath, '');
    fs.writeFileSync(path.join(dir, 'codex-code-mode-host.exe'), '');
    return cliPath;
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-binary-locator-'));
    process.env.PATH = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process, 'platform', originalPlatform);
    restoreEnvironmentVariable('CODEX_INSTALL_DIR');
    restoreEnvironmentVariable('HOME');
    restoreEnvironmentVariable('LOCALAPPDATA');
    restoreEnvironmentVariable('PATH');
    restoreEnvironmentVariable('USERPROFILE');
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds a codex executable on PATH', () => {
    const pathDir = path.join(tempDir, 'bin');
    const pathBinary = path.join(pathDir, process.platform === 'win32' ? 'codex.exe' : 'codex');
    fs.mkdirSync(pathDir, { recursive: true });
    fs.writeFileSync(pathBinary, '');

    process.env.PATH = pathDir;

    expect(findCodexBinaryPath()).toBe(pathBinary);
  });

  it('finds a Windows codex.cmd shim on PATH', () => {
    const pathDir = path.join(tempDir, 'bin');
    const pathBinary = path.join(pathDir, 'codex.cmd');
    fs.mkdirSync(pathDir, { recursive: true });
    fs.writeFileSync(pathBinary, '');

    process.env.PATH = pathDir;
    setPlatform('win32');

    expect(findCodexBinaryPath()).toBe(pathBinary);
  });

  it('finds a complete Codex install from CODEX_INSTALL_DIR on Windows', () => {
    const installDir = path.join(tempDir, 'custom-codex-install');
    const cliPath = createCompleteWindowsCodexRuntime(installDir);
    process.env.CODEX_INSTALL_DIR = installDir;
    process.env.LOCALAPPDATA = path.join(tempDir, 'empty-local-app-data');

    setPlatform('win32');

    expect(findCodexBinaryPath()).toBe(cliPath);
  });

  it('finds the default standalone Codex install on Windows', () => {
    process.env.LOCALAPPDATA = tempDir;
    delete process.env.CODEX_INSTALL_DIR;
    const installDir = path.join(tempDir, 'Programs', 'OpenAI', 'Codex', 'bin');
    const cliPath = createCompleteWindowsCodexRuntime(installDir);

    setPlatform('win32');

    expect(findCodexBinaryPath()).toBe(cliPath);
  });

  it('finds the newest complete Codex desktop runtime on Windows', () => {
    process.env.LOCALAPPDATA = tempDir;
    delete process.env.CODEX_INSTALL_DIR;
    const runtimeRoot = path.join(tempDir, 'OpenAI', 'Codex', 'bin');
    const olderCompleteDir = path.join(runtimeRoot, 'older-complete-runtime');
    const olderCompleteCliPath = createCompleteWindowsCodexRuntime(olderCompleteDir);
    const newerCompleteDir = path.join(runtimeRoot, 'newer-complete-runtime');
    const newerCompleteCliPath = createCompleteWindowsCodexRuntime(newerCompleteDir);
    const incompleteDir = path.join(runtimeRoot, 'newer-incomplete-runtime');
    fs.mkdirSync(incompleteDir, { recursive: true });
    const incompleteCliPath = path.join(incompleteDir, 'codex.exe');
    fs.writeFileSync(incompleteCliPath, '');
    fs.utimesSync(
      olderCompleteCliPath,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-01T00:00:00Z'),
    );
    fs.utimesSync(
      newerCompleteCliPath,
      new Date('2027-01-01T00:00:00Z'),
      new Date('2027-01-01T00:00:00Z'),
    );
    fs.utimesSync(
      incompleteCliPath,
      new Date('2028-01-01T00:00:00Z'),
      new Date('2028-01-01T00:00:00Z'),
    );

    setPlatform('win32');

    expect(findCodexBinaryPath()).toBe(newerCompleteCliPath);
  });

  it('breaks equal desktop runtime timestamps by path regardless of directory enumeration order', () => {
    process.env.LOCALAPPDATA = tempDir;
    delete process.env.CODEX_INSTALL_DIR;
    const root = path.join(tempDir, 'OpenAI', 'Codex', 'bin');
    const first = createCompleteWindowsCodexRuntime(path.join(root, 'aaa'));
    const second = createCompleteWindowsCodexRuntime(path.join(root, 'bbb'));
    const timestamp = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(first, timestamp, timestamp);
    fs.utimesSync(second, timestamp, timestamp);
    const entries = fs.readdirSync(root, { withFileTypes: true });
    entries.sort((left, right) => right.name.localeCompare(left.name));
    jest.spyOn(jest.requireActual<typeof fs>('fs'), 'readdirSync').mockReturnValueOnce(entries as never);

    setPlatform('win32');

    expect(findCodexBinaryPath()).toBe(first);
  });

  it.each(['darwin', 'linux'] as const)('prefers inherited PATH over automatic %s installations', (platform) => {
    process.env.HOME = tempDir;
    const automaticDir = platform === 'darwin'
      ? path.join(tempDir, 'Applications', 'Codex.app', 'Contents', 'Resources')
      : path.join(tempDir, '.local', 'bin');
    const pathDir = path.join(tempDir, 'chosen-cli');
    fs.mkdirSync(automaticDir, { recursive: true });
    fs.mkdirSync(pathDir);
    fs.writeFileSync(path.join(automaticDir, 'codex'), '');
    const pathBinary = path.join(pathDir, 'codex');
    fs.writeFileSync(pathBinary, '');
    process.env.PATH = pathDir;

    setPlatform(platform);

    expect(findCodexBinaryPath()).toBe(pathBinary);
  });

  it('falls back from an incomplete install override to a complete desktop runtime', () => {
    process.env.LOCALAPPDATA = tempDir;
    const override = path.join(tempDir, 'incomplete');
    fs.mkdirSync(override);
    fs.writeFileSync(path.join(override, 'codex.exe'), '');
    process.env.CODEX_INSTALL_DIR = override;
    const desktop = createCompleteWindowsCodexRuntime(
      path.join(tempDir, 'OpenAI', 'Codex', 'bin', 'hash'),
    );

    setPlatform('win32');

    expect(findCodexBinaryPath()).toBe(desktop);
  });

  it('prefers the macOS Codex app bundle over the ChatGPT app fallback', () => {
    process.env.HOME = tempDir;
    const appDir = path.join(tempDir, 'Applications', 'Codex.app', 'Contents', 'Resources');
    const appBinary = path.join(appDir, 'codex');
    const chatGptAppDir = path.join(
      tempDir,
      'Applications',
      'ChatGPT.app',
      'Contents',
      'Resources',
    );
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(chatGptAppDir, { recursive: true });
    fs.writeFileSync(appBinary, '');
    fs.writeFileSync(path.join(chatGptAppDir, 'codex'), '');

    setPlatform('darwin');

    expect(findCodexBinaryPath()).toBe(appBinary);
  });

  it('falls back to the unified macOS ChatGPT app bundle', () => {
    process.env.HOME = tempDir;
    const appDir = path.join(tempDir, 'Applications', 'ChatGPT.app', 'Contents', 'Resources');
    const appBinary = path.join(appDir, 'codex');
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(appBinary, '');

    setPlatform('darwin');

    expect(findCodexBinaryPath()).toBe(appBinary);
  });

  it('prefers a user-local Codex binary over the ChatGPT app fallback', () => {
    process.env.HOME = tempDir;
    const localDir = path.join(tempDir, '.local', 'bin');
    const localBinary = path.join(localDir, 'codex');
    const appDir = path.join(tempDir, 'Applications', 'ChatGPT.app', 'Contents', 'Resources');
    fs.mkdirSync(localDir, { recursive: true });
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(localBinary, '');
    fs.writeFileSync(path.join(appDir, 'codex'), '');

    setPlatform('darwin');

    expect(findCodexBinaryPath()).toBe(localBinary);
  });

  it('prefers a user-local Codex binary before generic Unix PATH auto-detection', () => {
    process.env.HOME = tempDir;
    const localDir = path.join(tempDir, '.local', 'bin');
    const localBinary = path.join(localDir, 'codex');
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(localBinary, '');

    setPlatform('linux');

    expect(findCodexBinaryPath()).toBe(localBinary);
  });
});
