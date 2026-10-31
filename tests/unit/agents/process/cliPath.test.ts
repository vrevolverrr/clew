import type * as osType from 'os';
import type * as pathType from 'path';

const os = jest.requireActual<typeof osType>('os');
const path = jest.requireActual<typeof pathType>('path');

import { normalizeConfiguredCLIPath, parsePathEntries } from '@/agents/process/cliPath';

const isWindows = process.platform === 'win32';

describe('parsePathEntries', () => {
  it.each([undefined, ''])('returns empty array for %p', (value) => {
    expect(parsePathEntries(value)).toEqual([]);
  });

  it('splits on platform separator', () => {
    const sep = isWindows ? ';' : ':';
    const entries = isWindows ? ['C:\\alpha', 'D:\\beta', 'E:\\gamma'] : ['/alpha', '/beta', '/gamma'];
    expect(parsePathEntries(entries.join(sep))).toEqual(entries);
  });

  it('filters out empty segments', () => {
    const sep = isWindows ? ';' : ':';
    const result = parsePathEntries(`${sep}/a${sep}${sep}/b${sep}`);
    expect(result).toEqual(isWindows ? ['A:', 'B:'] : ['/a', '/b']);
  });

  it.each(['$PATH', '${PATH}', '%PATH%'])('filters out %s placeholder', (placeholder) => {
    const sep = isWindows ? ';' : ':';
    const result = parsePathEntries(`/a${sep}${placeholder}${sep}/b`);
    expect(result).toEqual(isWindows ? ['A:', 'B:'] : ['/a', '/b']);
  });

  it.each([
    ['double', '"/quoted/path"'],
    ['single', "'/quoted/path'"],
  ])('strips surrounding %s quotes', (_kind, quoted) => {
    const sep = isWindows ? ';' : ':';
    const result = parsePathEntries(`${quoted}${sep}/normal`);
    expect(result[0]).toBe('/quoted/path');
  });

  it('expands ~ in entries', () => {
    const result = parsePathEntries('~/bin');
    expect(result[0]).toBe(path.join(os.homedir(), 'bin'));
  });
});

describe('normalizeConfiguredCLIPath', () => {
  it.each([
    ['strips surrounding double quotes from a path containing a space', '"/opt/my cli/claude"', '/opt/my cli/claude'],
    ['strips surrounding single quotes', "'/opt/claude'", '/opt/claude'],
    ['leaves an unquoted path unchanged', '/opt/my cli/claude', '/opt/my cli/claude'],
    ['leaves a path with only a leading quote unchanged', '"/opt/claude', '"/opt/claude'],
    ['trims surrounding whitespace before unquoting', '  "/opt/claude"  ', '/opt/claude'],
  ])('%s', (_name, input, expected) => {
    expect(normalizeConfiguredCLIPath(input)).toBe(expected);
  });

  it('expands environment variables after unquoting', () => {
    const original = process.env.TEST_QUOTED_CLI_DIR;
    process.env.TEST_QUOTED_CLI_DIR = '/opt/tools';
    try {
      expect(normalizeConfiguredCLIPath('"$TEST_QUOTED_CLI_DIR/my cli"')).toBe('/opt/tools/my cli');
    } finally {
      if (original === undefined) delete process.env.TEST_QUOTED_CLI_DIR;
      else process.env.TEST_QUOTED_CLI_DIR = original;
    }
  });

  it('expands a home-relative path after unquoting', () => {
    expect(normalizeConfiguredCLIPath('"~/bin/my cli"')).toBe(path.join(os.homedir(), 'bin/my cli'));
  });

  it('returns an empty string for blank or missing input', () => {
    expect(normalizeConfiguredCLIPath('   ')).toBe('');
    expect(normalizeConfiguredCLIPath(undefined)).toBe('');
  });
});
