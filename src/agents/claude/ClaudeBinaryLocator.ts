import * as os from 'os';
import * as path from 'path';

import { findBinaryInDirectories, isExistingFile } from '@/agents/process/cliBinaryLocator';
import { parsePathEntries } from '@/agents/process/cliPath';
import { getEnhancedPath } from '@/agents/process/env';

/** Where npm puts the native binary inside its package, from Claude Code 2.1.113 on. */
const PACKAGE_BINARY = ['node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'];

/** The native `claude` executable; Claude Code before 2.1.113, whose npm package ran `cli.js` through Node, is not supported. */
export function findClaudeBinaryPath(): string | null {
  const home = os.homedir();
  const isWindows = process.platform === 'win32';
  const pathEntries = parsePathEntries(getEnhancedPath());
  // Claude's native installer uses these; prefer them over system installs.
  const nativeDirectories = [
    path.join(home, '.claude', 'local'),
    ...(isWindows ? [
      path.join(home, 'AppData', 'Local', 'Claude'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Claude'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Claude'),
    ] : []),
    path.join(home, '.local', 'bin'),
  ];
  const found = findBinaryInDirectories([...nativeDirectories, ...pathEntries], [isWindows ? 'claude.exe' : 'claude']);
  if (found) return found;

  // npm's Windows shims (`claude.cmd`, an extension-less sh script) cannot be spawned directly, so the binary they call is.
  const npmPrefix = process.env.npm_config_prefix;
  const packageParents = isWindows
    ? [
      ...pathEntries,
      path.join(home, 'AppData', 'Roaming', 'npm'),
      ...(process.env.APPDATA ? [path.join(process.env.APPDATA, 'npm')] : []),
      ...(npmPrefix ? [npmPrefix] : []),
    ]
    : [path.join(home, '.npm-global', 'lib'), '/usr/local/lib', '/usr/lib', ...(npmPrefix ? [path.join(npmPrefix, 'lib')] : [])];
  return packageParents.map((parent) => path.join(parent, ...PACKAGE_BINARY)).find(isExistingFile) ?? null;
}
