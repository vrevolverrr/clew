import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { resolveConfiguredCLIPath } from '@/agents/process/cliBinaryLocator';

describe('cliBinaryLocator', () => {
  let tempDir: string;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const originalPath = process.env.PATH;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-binary-locator-'));
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    process.env.PATH = originalPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves configured CLI files', () => {
    const cliPath = path.join(tempDir, 'pi');
    fs.writeFileSync(cliPath, '');

    expect(resolveConfiguredCLIPath(cliPath)).toBe(cliPath);
  });

  it('resolves a configured CLI path that was pasted with surrounding quotes', () => {
    const binDir = path.join(tempDir, 'my tools');
    const cliPath = path.join(binDir, 'pi');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(cliPath, '');

    expect(resolveConfiguredCLIPath(`"${cliPath}"`)).toBe(cliPath);
  });

  it('finds Windows npm .cmd shims on a PATH entry', () => {
    const binDir = path.join(tempDir, 'bin');
    const shimPath = path.join(binDir, 'clew-probe.cmd');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(shimPath, '');
    process.env.PATH = binDir;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    // env.ts reads the platform when it loads
    let found: string | null = null;
    jest.isolateModules(() => {
      found = jest.requireActual<typeof import('@/agents/process/cliBinaryLocator')>('@/agents/process/cliBinaryLocator').findCLIBinaryPath('clew-probe');
    });

    expect(found).toBe(shimPath);
  });
});
