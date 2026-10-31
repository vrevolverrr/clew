import type * as fsType from 'fs';
import type * as pathType from 'path';

const fs = jest.requireActual<typeof fsType>('fs');
const path = jest.requireActual<typeof pathType>('path');

import { parsePathEntries } from '@/agents/process/cliPath';
import * as env from '@/agents/process/env';

const {
  cliPathRequiresNode,
  getEnhancedPath,
} = env;

const isWindows = process.platform === 'win32';
const SEP = isWindows ? ';' : ':';

/** Narrow `fs.accessSync` boundary: listed candidates are executable, all others fail admission. */
function mockExecuteAccess(...runnablePaths: string[]): void {
  jest.spyOn(fs, 'accessSync').mockImplementation(((p: fsType.PathLike) => {
    if (runnablePaths.includes(String(p))) return;
    throw Object.assign(new Error(`EACCES: permission denied, access '${String(p)}'`), { code: 'EACCES' });
  }) as typeof fs.accessSync);
}

describe('getEnhancedPath', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore environment
    Object.keys(process.env).forEach(key => delete process.env[key]);
    Object.assign(process.env, originalEnv);
  });

  describe('basic functionality', () => {
    it('includes current PATH from process.env', () => {
      process.env.PATH = `/existing/path${SEP}/another/path`;
      const result = getEnhancedPath();
      expect(result).toContain('/existing/path');
      expect(result).toContain('/another/path');
    });

    it('works when process.env.PATH is undefined', () => {
      delete process.env.PATH;
      process.env.HOME = '/mock/home';
      const segments = getEnhancedPath().split(SEP);
      expect(segments).toEqual(expect.arrayContaining([
        path.join('/mock/home', '.local', 'bin'),
        ...(isWindows ? [] : ['/usr/local/bin']),
      ]));
    });
  });

  describe('deduplication logic', () => {
    it('deduplicates across all sources', () => {
      // Paths repeat within PATH and may also be in the extra paths
      process.env.PATH = `/usr/local/bin${SEP}/usr/bin${SEP}/usr/local/bin`;
      const result = getEnhancedPath();
      const segments = result.split(SEP);

      // Each unique path should appear only once
      const localBinCount = segments.filter(s => s === '/usr/local/bin').length;
      const usrBinCount = segments.filter(s => s === '/usr/bin').length;
      expect(localBinCount).toBe(1);
      expect(usrBinCount).toBe(1);
    });
  });

  describe('empty segment filtering', () => {
    it('filters out empty segments from current PATH', () => {
      process.env.PATH = `/usr/bin${SEP}${SEP}/bin${SEP}`;
      const result = getEnhancedPath();
      const segments = result.split(SEP);
      expect(segments.every(s => s.length > 0)).toBe(true);
    });
  });

  describe('extra binary paths', () => {
    it('includes the user bin path from HOME', () => {
      process.env.HOME = '/mock/home';
      const result = getEnhancedPath();
      const segments = result.split(SEP);

      expect(segments).toContain(path.join('/mock/home', 'bin'));
    });
  });

  describe('Unix environment variable paths', () => {
    if (isWindows) return;

    it.each([
      ['VOLTA_HOME', '/custom/volta', ['/custom/volta/bin']],
      ['ASDF_DATA_DIR', '/custom/asdf', ['/custom/asdf/shims', '/custom/asdf/bin']],
      ['ASDF_DIR', '/alt/asdf', ['/alt/asdf/shims', '/alt/asdf/bin']],
      ['NVM_BIN', '/home/user/.nvm/versions/node/v20/bin', ['/home/user/.nvm/versions/node/v20/bin']],
    ])('includes the paths for %s when set', (name, value, expected) => {
      delete process.env.ASDF_DATA_DIR;
      process.env[name] = value;
      expect(getEnhancedPath().split(SEP)).toEqual(expect.arrayContaining(expected));
    });

    describe('fnm aliases (Unix)', () => {
      if (isWindows) return;

      it('includes default Node.js bins without the fnm shell hook', () => {
        delete process.env.XDG_DATA_HOME;
        process.env.FNM_DIR = '/custom/fnm';
        process.env.HOME = '/fake/home';
        const entries = parsePathEntries(getEnhancedPath());
        expect(entries).toEqual(expect.arrayContaining([
          '/custom/fnm/aliases/default/bin',
          '/fake/home/.local/share/fnm/aliases/default/bin',
          '/fake/home/.fnm/aliases/default/bin',
          ...(process.platform === 'darwin' ? ['/fake/home/Library/Application Support/fnm/aliases/default/bin'] : []),
        ]));
      });
    });

    describe('other Node.js and CLI managers (Unix)', () => {
      if (isWindows) return;

      const managerVariables = ['NODENV_ROOT', 'PROTO_HOME', 'PNPM_HOME', 'N_PREFIX', 'NVS_HOME', 'XDG_DATA_HOME'];

      it('includes default locations without shell variables', () => {
        for (const key of managerVariables) delete process.env[key];
        process.env.HOME = '/fake/home';
        const entries = parsePathEntries(getEnhancedPath());
        expect(entries).toEqual(expect.arrayContaining([
          '/fake/home/.nodenv/shims',
          '/fake/home/.proto/shims',
          '/fake/home/.proto/bin',
          '/fake/home/.local/share/pnpm',
          '/fake/home/.nvs/default/bin',
          '/fake/home/.nix-profile/bin',
          '/nix/var/nix/profiles/default/bin',
          '/run/current-system/sw/bin',
          '/opt/local/bin',
          '/home/linuxbrew/.linuxbrew/bin',
          ...(process.platform === 'darwin' ? ['/fake/home/Library/pnpm'] : []),
        ]));
      });

      it('follows manager home variables', () => {
        process.env.HOME = '/fake/home';
        process.env.XDG_DATA_HOME = '/xdg';
        process.env.NODENV_ROOT = '/custom/nodenv';
        process.env.PROTO_HOME = '/custom/proto';
        process.env.PNPM_HOME = '/custom/pnpm';
        process.env.N_PREFIX = '/custom/n';
        process.env.NVS_HOME = '/custom/nvs';
        const entries = parsePathEntries(getEnhancedPath());
        expect(entries).toEqual(expect.arrayContaining([
          '/xdg/pnpm',
          '/custom/nodenv/shims',
          '/custom/proto/shims',
          '/custom/proto/bin',
          '/custom/pnpm',
          '/custom/n/bin',
          '/custom/nvs/default/bin',
        ]));
        expect(entries).not.toContain('/fake/home/.nodenv/shims');
      });
    });

    describe('nvm fallback when NVM_BIN is not set (Unix)', () => {
      if (isWindows) return;

      let savedNvmBin: string | undefined;
      let savedNvmDir: string | undefined;
      let savedHome: string | undefined;

      beforeEach(() => {
        savedNvmBin = process.env.NVM_BIN;
        savedNvmDir = process.env.NVM_DIR;
        savedHome = process.env.HOME;
        delete process.env.NVM_BIN;
        delete process.env.NVM_DIR;
        process.env.HOME = '/fake/home';
      });

      afterEach(() => {
        jest.restoreAllMocks();
        if (savedNvmBin !== undefined) process.env.NVM_BIN = savedNvmBin;
        else delete process.env.NVM_BIN;
        if (savedNvmDir !== undefined) process.env.NVM_DIR = savedNvmDir;
        else delete process.env.NVM_DIR;
        if (savedHome !== undefined) process.env.HOME = savedHome;
        else delete process.env.HOME;
      });

      function mockNvm(opts: {
        nvmDir: string;
        aliasFiles: Record<string, string>;
        versions: string[];
        existingBinDirs?: string[];
      }) {
        const { nvmDir, aliasFiles, versions, existingBinDirs } = opts;
        const binDirs = existingBinDirs ?? versions.map(v => path.join(nvmDir, 'versions', 'node', v, 'bin'));

        jest.spyOn(fs, 'existsSync').mockImplementation(p => binDirs.includes(String(p)));
        jest.spyOn(fs, 'readFileSync').mockImplementation(((p: string) => {
          const s = String(p);
          for (const [aliasPath, value] of Object.entries(aliasFiles)) {
            if (s === aliasPath) return value;
          }
          throw new Error('not found');
        }) as unknown as typeof fs.readFileSync);
        jest.spyOn(fs, 'readdirSync').mockImplementation(((p: string) => {
          if (String(p) === path.join(nvmDir, 'versions', 'node')) return versions;
          return [];
        }) as typeof fs.readdirSync);
        jest.spyOn(fs, 'statSync').mockImplementation(
          () => ({ isFile: () => true, isDirectory: () => true }) as fsType.Stats
        );
      }

      it('resolves default version from alias file', () => {
        const nvmDir = '/fake/home/.nvm';
        const versionBin = path.join(nvmDir, 'versions', 'node', 'v22.18.0', 'bin');
        mockNvm({
          nvmDir,
          aliasFiles: { [path.join(nvmDir, 'alias', 'default')]: '22' },
          versions: ['v22.18.0'],
        });

        expect(getEnhancedPath()).toContain(versionBin);
      });

      it('respects NVM_DIR env var', () => {
        process.env.NVM_DIR = '/custom/nvm';
        const versionBin = '/custom/nvm/versions/node/v20.10.0/bin';
        mockNvm({
          nvmDir: '/custom/nvm',
          aliasFiles: { '/custom/nvm/alias/default': '20' },
          versions: ['v20.10.0'],
        });

        expect(getEnhancedPath()).toContain(versionBin);
      });

      it('picks highest matching version when multiple match', () => {
        const nvmDir = '/fake/home/.nvm';
        const expectedBin = path.join(nvmDir, 'versions', 'node', 'v22.18.0', 'bin');
        mockNvm({
          nvmDir,
          aliasFiles: { [path.join(nvmDir, 'alias', 'default')]: '22' },
          versions: ['v22.5.0', 'v22.18.0', 'v20.10.0'],
        });

        const result = getEnhancedPath();
        expect(result).toContain(expectedBin);
        expect(result).not.toContain('v22.5.0');
      });

      it('follows alias chains (lts/* → lts/jod → version)', () => {
        const nvmDir = '/fake/home/.nvm';
        const versionBin = path.join(nvmDir, 'versions', 'node', 'v22.18.0', 'bin');
        mockNvm({
          nvmDir,
          aliasFiles: {
            [path.join(nvmDir, 'alias', 'default')]: 'lts/*',
            [path.join(nvmDir, 'alias', 'lts', '*')]: 'lts/jod',
            [path.join(nvmDir, 'alias', 'lts', 'jod')]: 'v22.18.0',
          },
          versions: ['v22.18.0', 'v20.10.0'],
        });

        expect(getEnhancedPath()).toContain(versionBin);
      });

      it.each(['node', 'stable'])(
        'resolves built-in %s alias to the highest installed version',
        builtInAlias => {
          const nvmDir = '/fake/home/.nvm';
          const expectedBin = path.join(nvmDir, 'versions', 'node', 'v22.18.0', 'bin');
          mockNvm({
            nvmDir,
            aliasFiles: {
              [path.join(nvmDir, 'alias', 'default')]: builtInAlias,
            },
            versions: ['v20.10.0', 'v22.18.0'],
          });

          const result = getEnhancedPath();
          expect(result).toContain(expectedBin);
          expect(result).not.toContain('v20.10.0');
        }
      );

      it('resolves a custom v-prefixed alias through its alias file', () => {
        delete process.env.NVM_BIN;
        process.env.NVM_DIR = '/custom/nvm';
        mockNvm({
          nvmDir: '/custom/nvm',
          aliasFiles: {
            '/custom/nvm/alias/default': 'vault-node',
            '/custom/nvm/alias/vault-node': 'v24.16.0',
          },
          versions: ['v24.16.0'],
        });

        const entries = parsePathEntries(getEnhancedPath());
        expect(entries).toContain('/custom/nvm/versions/node/v24.16.0/bin');
      });
    });
  });

  describe('CLI path parameter for Node.js detection', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    function mockNodeExecutable(fakeDir: string) {
      const nodePath = path.join(fakeDir, isWindows ? 'node.exe' : 'node');
      jest.spyOn(fs, 'existsSync').mockImplementation(p => String(p) === nodePath);
      jest.spyOn(fs, 'statSync').mockImplementation(
        p => ({ isFile: () => String(p) === nodePath }) as fsType.Stats
      );
      mockExecuteAccess(nodePath);
      return nodePath;
    }

    it.each([
      ['/path/to/cli.js', 'before'],
      ['/path/to/claude.exe', 'after'],
    ])('places the detected node directory for %s %s the extra paths', (cliPath, order) => {
      const fakeDir = isWindows ? 'C:\\fake\\node' : '/tmp/fake-node';
      mockNodeExecutable(fakeDir);

      const otherPath = isWindows ? 'C:\\other' : '/other';
      process.env.PATH = `${fakeDir}${SEP}${otherPath}`;
      if (isWindows) {
        process.env.ProgramFiles = 'C:\\Program Files';
      }

      const result = getEnhancedPath(cliPath);
      const segments = result.split(SEP);
      const extraPath = isWindows ? 'C:\\Program Files\\nodejs' : '/usr/local/bin';

      const nodeIndex = segments.indexOf(fakeDir);
      const extraIndex = segments.indexOf(extraPath);

      expect(nodeIndex).toBeGreaterThanOrEqual(0);
      expect(extraIndex).toBeGreaterThanOrEqual(0);
      if (order === 'before') expect(nodeIndex).toBeLessThan(extraIndex);
      else expect(nodeIndex).toBeGreaterThan(extraIndex);
    });
  });

  describe('CLI directory with node executable (nvm/fnm/volta/asdf support)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    function mockCliDirWithNode(cliDir: string) {
      const nodePath = path.join(cliDir, isWindows ? 'node.exe' : 'node');
      jest.spyOn(fs, 'existsSync').mockImplementation(p => String(p) === nodePath);
      jest.spyOn(fs, 'statSync').mockImplementation(
        p => ({ isFile: () => String(p) === nodePath }) as fsType.Stats
      );
      mockExecuteAccess(nodePath);
    }

    it('adds CLI directory to PATH when it contains node (Unix nvm)', () => {
      if (isWindows) return;

      const nvmBinDir = '/Users/test/.nvm/versions/node/v20.10.0/bin';
      const cliPath = path.join(nvmBinDir, 'claude');
      mockCliDirWithNode(nvmBinDir);

      process.env.PATH = '/usr/bin';
      const result = getEnhancedPath(cliPath);
      const segments = result.split(SEP);

      // CLI directory should be added and come before /usr/bin
      expect(segments).toContain(nvmBinDir);
      expect(segments.indexOf(nvmBinDir)).toBeLessThan(segments.indexOf('/usr/bin'));
      expect(segments[0]).toBe(nvmBinDir);
    });

    it('adds CLI directory to PATH when it contains node (Windows nvm)', () => {
      if (!isWindows) return;

      const nvmBinDir = 'C:\\Users\\test\\AppData\\Roaming\\nvm\\v20.10.0';
      const cliPath = path.join(nvmBinDir, 'claude.cmd');
      mockCliDirWithNode(nvmBinDir);

      process.env.PATH = 'C:\\Windows\\System32';
      const result = getEnhancedPath(cliPath);
      const segments = result.split(SEP);

      // CLI directory should be added (case-insensitive check for Windows)
      const hasNvmDir = segments.some(s => s.toLowerCase() === nvmBinDir.toLowerCase());
      expect(hasNvmDir).toBe(true);
    });

    it('does not add CLI directory when node is not present', () => {
      const cliDir = isWindows ? 'C:\\custom\\bin' : '/custom/bin';
      const cliPath = path.join(cliDir, isWindows ? 'claude.exe' : 'claude');

      // Mock: node does not exist in CLI directory
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      process.env.PATH = isWindows ? 'C:\\Windows\\System32' : '/usr/bin';
      const result = getEnhancedPath(cliPath);

      expect(result).not.toContain(cliDir);
    });

    it('does not add a CLI directory whose sibling node lacks execute access', () => {
      if (isWindows) return;

      const cliDir = '/custom/bin';
      const cliPath = path.join(cliDir, 'cli.js');
      const nodePath = path.join(cliDir, 'node');
      jest.spyOn(fs, 'existsSync').mockImplementation(p => String(p) === nodePath);
      jest.spyOn(fs, 'statSync').mockImplementation(
        p => ({ isFile: () => String(p) === nodePath }) as fsType.Stats
      );
      mockExecuteAccess();

      process.env.PATH = '/usr/bin';
      const result = getEnhancedPath(cliPath);
      expect(result.split(SEP)).not.toContain(cliDir);
    });

  });
});

describe('cliPathRequiresNode', () => {
  it.each([
    ['/path/to/cli.js', true],
    ['C:\\path\\to\\cli.js', true],
    ['/path/to/cli.mjs', true],
    ['/path/to/cli.cjs', true],
    ['/path/to/cli.ts', true],
    ['/path/to/cli.tsx', true],
    ['/path/to/cli.jsx', true],
    ['/path/to/CLI.JS', true],
    ['/path/to/cli.MJS', true],
    ['/path/to/cli-wrapper.CJS', true],
    ['/path/to/claude', false],
    ['/path/to/claude.exe', false],
    ['C:\\path\\to\\claude.exe', false],
  ])('reports whether %p needs Node: %p', (cliPath, expected) => {
    expect(cliPathRequiresNode(cliPath)).toBe(expected);
  });
});

describe('getExtraBinaryPaths (Windows branches)', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.keys(process.env).forEach(key => delete process.env[key]);
    Object.assign(process.env, originalEnv);
    jest.resetModules();
  });

  function loadWithWindowsPlatform(): typeof env {
    jest.resetModules();
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    // Dynamic require needed to re-evaluate module with mocked platform
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/agents/process/env');
  }

  it.each([
    ['APPDATA npm path', { APPDATA: '/mock/AppData/Roaming', LOCALAPPDATA: '/mock/AppData/Local' }, path.join('/mock/AppData/Roaming', 'npm')],
    ['LOCALAPPDATA nodejs path', { LOCALAPPDATA: '/mock/AppData/Local' }, path.join('/mock/AppData/Local', 'Programs', 'nodejs')],
    ['NVM_SYMLINK', { NVM_SYMLINK: '/mock/nvm/symlink' }, '/mock/nvm/symlink'],
    ['NVM_HOME', { NVM_HOME: '/mock/nvm/home' }, '/mock/nvm/home'],
    ['APPDATA/nvm when NVM_HOME is not set', { NVM_HOME: undefined, APPDATA: '/mock/AppData/Roaming' }, path.join('/mock/AppData/Roaming', 'nvm')],
    ['VOLTA_HOME/bin', { VOLTA_HOME: '/mock/volta' }, path.join('/mock/volta', 'bin')],
    ['home/.volta/bin when VOLTA_HOME is not set', { VOLTA_HOME: undefined }, path.join('/mock/home', '.volta', 'bin')],
    ['ChocolateyInstall/bin', { ChocolateyInstall: '/mock/choco' }, path.join('/mock/choco', 'bin')],
    ['ProgramData/chocolatey/bin when ChocolateyInstall is not set', { ChocolateyInstall: undefined, ProgramData: undefined }, path.join('C:\\ProgramData', 'chocolatey', 'bin')],
    ['SCOOP shims', { SCOOP: '/mock/scoop' }, path.join('/mock/scoop', 'shims')],
    ['home/scoop shims when SCOOP is not set', { SCOOP: undefined }, path.join('/mock/home', 'scoop', 'shims')],
    ['Docker under Program Files', { ProgramFiles: '/mock/Program Files' }, path.join('/mock/Program Files', 'Docker', 'Docker', 'resources', 'bin')],
    ['home/.local/bin', {}, path.join('/mock/home', '.local', 'bin')],
    ['the inherited PATH, split on semicolons', { PATH: '/existing' }, '/existing'],
  ] as [string, Record<string, string | undefined>, string][])('includes %s', (_name, variables, entry) => {
    process.env.HOME = '/mock/home';
    for (const [key, value] of Object.entries(variables)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const entries = loadWithWindowsPlatform().getEnhancedPath().split(';');
    expect(entries).toContain(entry);
  });

  it('includes fnm default Node.js aliases without the PowerShell hook', () => {
    process.env.APPDATA = '/mock/AppData/Roaming';
    process.env.LOCALAPPDATA = '/mock/AppData/Local';
    process.env.HOME = '/mock/home';
    process.env.FNM_DIR = '/mock/fnm';
    const entries = loadWithWindowsPlatform().getEnhancedPath().split(';');
    expect(entries).toEqual(expect.arrayContaining([
      '/mock/fnm/aliases/default',
      '/mock/AppData/Roaming/fnm/aliases/default',
      '/mock/AppData/Local/fnm/aliases/default',
    ]));
    expect(entries).not.toContain('/mock/fnm/aliases/default/bin');
  });

  it('includes pnpm, proto, nvs, Yarn, and WinGet locations', () => {
    for (const key of ['PNPM_HOME', 'PROTO_HOME', 'NVS_HOME']) delete process.env[key];
    process.env.LOCALAPPDATA = '/mock/AppData/Local';
    process.env.USERPROFILE = '/mock/home';
    process.env.HOME = '/mock/home';
    let entries = loadWithWindowsPlatform().getEnhancedPath().split(';');
    expect(entries).toEqual(expect.arrayContaining([
      '/mock/AppData/Local/pnpm',
      '/mock/home/.proto/shims',
      '/mock/home/.proto/bin',
      '/mock/AppData/Local/nvs/default',
      '/mock/AppData/Local/Yarn/bin',
      '/mock/AppData/Local/Microsoft/WinGet/Links',
    ]));

    process.env.PNPM_HOME = '/custom/pnpm';
    process.env.PROTO_HOME = '/custom/proto';
    process.env.NVS_HOME = '/custom/nvs';
    entries = loadWithWindowsPlatform().getEnhancedPath().split(';');
    expect(entries).toEqual(expect.arrayContaining([
      '/custom/pnpm', '/custom/proto/shims', '/custom/proto/bin', '/custom/nvs/default',
    ]));
  });
});

describe('getEnhancedPath inside the Obsidian process', () => {
  const originalPlatform = process.platform;
  const originalExecPath = process.execPath;
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'execPath', { value: originalExecPath });
    Object.keys(process.env).forEach(key => delete process.env[key]);
    Object.assign(process.env, originalEnv);
    jest.resetModules();
  });

  function loadWithPlatform(platform: NodeJS.Platform, execPath: string): typeof env {
    jest.resetModules();
    Object.defineProperty(process, 'platform', { value: platform, writable: true });
    Object.defineProperty(process, 'execPath', { value: execPath, configurable: true });
    // Dynamic require needed to re-evaluate module with mocked platform/execPath
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/agents/process/env');
  }

  it.each([
    '/Applications/Obsidian.app/Contents/MacOS/Obsidian',
    '/Applications/Obsidian.app/Contents/Frameworks/Obsidian Helper (Renderer).app/Contents/MacOS/Obsidian Helper (Renderer)',
  ])('preserves inherited CLI precedence when running %s', (execPath) => {
    const cliDirectory = '/custom/obsidian-cli/bin';
    const appDirectory = '/Applications/Obsidian.app/Contents/MacOS';
    process.env.PATH = `${cliDirectory}:${appDirectory}`;

    const mod = loadWithPlatform('darwin', execPath);
    const segments = mod.getEnhancedPath().split(':');

    expect(segments).toContain(cliDirectory);
    expect(segments).toContain(appDirectory);
    expect(segments.indexOf(cliDirectory)).toBeLessThan(segments.indexOf(appDirectory));
  });

  it('does not add transient Linux AppImage mount dirs', () => {
    const appImageExecPath = '/tmp/.mount_Obsidian-abcd1234/usr/bin/obsidian';
    const appImageDir = path.dirname(appImageExecPath);
    process.env.HOME = '/home/test';
    process.env.PATH = '';

    const mod = loadWithPlatform('linux', appImageExecPath);
    const result = mod.getEnhancedPath();
    const segments = result.split(':');

    expect(segments).not.toContain(appImageDir);
    expect(segments).toContain('/usr/local/bin');
    expect(segments).toContain(path.join('/home/test', '.local', 'bin'));
  });
});
