import type * as fsType from 'fs';
import type * as osType from 'os';
import type * as pathType from 'path';

const fs = jest.requireActual<typeof fsType>('fs');
const os = jest.requireActual<typeof osType>('os');
const path = jest.requireActual<typeof pathType>('path');

import { findClaudeBinaryPath } from '@/agents/claude/ClaudeBinaryLocator';

const isWindows = process.platform === 'win32';

describe('findClaudeBinaryPath', () => {
  let findClaudeBinaryPath: () => string | null;
  const originalPlatform = process.platform;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.PATH = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = originalEnv;
  });

  describe('on Unix/macOS', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env.HOME = '/home/test';
      jest.isolateModules(() => {
        ({ findClaudeBinaryPath } = jest.requireActual('@/agents/claude/ClaudeBinaryLocator'));
      });
    });

    function mockExistingFile(...paths: string[]) {
      const pathSet = new Set(paths.map(value => path.normalize(value)));
      jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => pathSet.has(p));
      jest.spyOn(fs, 'statSync').mockImplementation((p: any) => ({
        isFile: () => pathSet.has(String(p)),
      }) as fsType.Stats);
    }

    it('should prefer the user-local native install over a system installation', () => {
      jest.spyOn(os, 'homedir').mockReturnValue('/home/test');
      mockExistingFile('/home/test/.local/bin/claude', '/usr/local/bin/claude');

      expect(findClaudeBinaryPath()).toBe(path.normalize('/home/test/.local/bin/claude'));
    });

    it('should return null when Claude CLI is not found', () => {
      jest.spyOn(os, 'homedir').mockReturnValue('/home/test');
      jest.spyOn(fs, 'statSync').mockImplementation(() => { throw new Error('Not found'); });

      expect(findClaudeBinaryPath()).toBeNull();
    });

    it('should fall back to the native binary in the npm package on Unix', () => {
      jest.spyOn(os, 'homedir').mockReturnValue('/home/test');
      mockExistingFile('/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe');

      expect(findClaudeBinaryPath()).toBe(path.normalize('/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe'));
    });

    it('should resolve Claude CLI from PATH', () => {
      mockExistingFile('/custom/bin/claude');

      const customPath = '/custom/bin:/usr/bin';
      process.env.PATH = customPath;
      expect(findClaudeBinaryPath()).toBe(path.normalize('/custom/bin/claude'));
    });

    it('should expand home directory in PATH', () => {
      jest.spyOn(os, 'homedir').mockReturnValue('/home/test');
      mockExistingFile('/home/test/bin/claude');

      const customPath = '~/bin:/usr/bin';
      process.env.PATH = customPath;
      expect(findClaudeBinaryPath()).toBe(path.normalize('/home/test/bin/claude'));
    });

    it('should not return a directory path even if it exists', () => {
      jest.spyOn(os, 'homedir').mockReturnValue('/home/test');
      const dirPath = path.join('/home/test', '.local', 'bin', 'claude');
      jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => p === dirPath);
      jest.spyOn(fs, 'statSync').mockImplementation(() => ({
        isFile: () => false,
      }) as fsType.Stats);

      expect(findClaudeBinaryPath()).toBeNull();
    });
  });

  describe('on Windows', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.ProgramFiles = 'C:\\Program Files';
      process.env['ProgramFiles(x86)'] = 'C:\\Program Files (x86)';
      process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
      process.env.HOME = 'C:\\Users\\test';
      jest.isolateModules(() => {
        ({ findClaudeBinaryPath } = jest.requireActual('@/agents/claude/ClaudeBinaryLocator'));
      });
    });

    function mockExistingFile(...paths: string[]) {
      const pathSet = new Set(paths);
      jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => pathSet.has(p));
      jest.spyOn(fs, 'statSync').mockImplementation((p: any) => ({
        isFile: () => pathSet.has(String(p)),
      }) as fsType.Stats);
    }

    it('should prefer the native install over the npm package binary', () => {
      jest.spyOn(os, 'homedir').mockReturnValue('C:\\Users\\test');
      const exePath = path.join('C:\\Users\\test', '.claude', 'local', 'claude.exe');
      const packageBinary = path.join('C:\\Users\\test', 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      mockExistingFile(exePath, packageBinary);

      expect(findClaudeBinaryPath()).toBe(exePath);
    });

    it('should use the npm package binary instead of the .cmd shim', () => {
      jest.spyOn(os, 'homedir').mockReturnValue('C:\\Users\\test');
      // Note: path.join uses actual platform separator, so we match against that
      const packageBinary = path.join('C:\\Users\\test', 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      const cmdPath = path.join('C:\\Users\\test', 'AppData', 'Roaming', 'npm', 'claude.cmd');
      mockExistingFile(cmdPath, packageBinary);

      expect(findClaudeBinaryPath()).toBe(packageBinary);
    });

    it('should find the package binary in a custom npm prefix via npm_config_prefix', () => {
      jest.spyOn(os, 'homedir').mockReturnValue('C:\\Users\\test');
      process.env.npm_config_prefix = 'D:\\nodejs\\node_global';
      const expectedPath = path.join('D:\\nodejs\\node_global', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      mockExistingFile(expectedPath);

      expect(findClaudeBinaryPath()).toBe(expectedPath);
    });

    it.each(['claude', 'claude.cmd'])(
      'should ignore %s shell shims in shared discovery directories',
      (filename) => {
        jest.spyOn(os, 'homedir').mockReturnValue('C:\\Users\\test');
        mockExistingFile(path.join('C:\\Users\\test', '.local', 'bin', filename));

        expect(findClaudeBinaryPath()).toBeNull();
      },
    );

    it('should find a native executable in enhanced PATH directories', () => {
      process.env.MISE_SHIMS_DIR = 'C:\\mise\\shims';
      const executable = path.join(process.env.MISE_SHIMS_DIR, 'claude.exe');
      mockExistingFile(executable);

      expect(findClaudeBinaryPath()).toBe(executable);
    });

    it('should resolve the npm package binary near enhanced PATH directories', () => {
      process.env.MISE_SHIMS_DIR = 'C:\\mise\\shims';
      const entrypoint = path.join(process.env.MISE_SHIMS_DIR, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      mockExistingFile(path.join(process.env.MISE_SHIMS_DIR, 'claude.cmd'), entrypoint);

      expect(findClaudeBinaryPath()).toBe(entrypoint);
    });

    it('should return null when no CLI is found on Windows', () => {
      jest.spyOn(os, 'homedir').mockReturnValue('C:\\Users\\test');
      jest.spyOn(fs, 'statSync').mockImplementation(() => { throw new Error('Not found'); });

      expect(findClaudeBinaryPath()).toBeNull();
    });

    it('should prefer the package binary over the extension-less npm sh shim', () => {
      const npmBin = 'D:\\npm-global';
      const shimPath = path.join(npmBin, 'claude');
      const packageBinary = path.join(npmBin, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      mockExistingFile(shimPath, packageBinary);

      const customPath = `${npmBin};C:\\Windows\\System32`;
      process.env.PATH = customPath;
      expect(findClaudeBinaryPath()).toBe(packageBinary);
    });

  });
});

describe('native platform CLI discovery', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('finds claude from common paths', () => {
    const commonPath = path.join(os.homedir(), '.claude', 'local', isWindows ? 'claude.exe' : 'claude');

    jest.spyOn(fs, 'existsSync').mockImplementation(
      p => String(p) === commonPath
    );
    jest.spyOn(fs, 'statSync').mockImplementation(
      p => ({ isFile: () => String(p) === commonPath }) as fsType.Stats
    );

    const result = findClaudeBinaryPath();
    expect(result).toBe(commonPath);
  });

  it('does not run the cli.js of an npm package older than 2.1.113', () => {
    const legacyCliPath = path.join(
      os.homedir(), ...(isWindows ? ['AppData', 'Roaming', 'npm'] : ['.npm-global', 'lib']), 'node_modules',
      '@anthropic-ai', 'claude-code', 'cli.js'
    );
    jest.spyOn(fs, 'statSync').mockImplementation(
      p => ({ isFile: () => String(p) === legacyCliPath }) as fsType.Stats
    );

    expect(findClaudeBinaryPath()).toBeNull();
  });
});
