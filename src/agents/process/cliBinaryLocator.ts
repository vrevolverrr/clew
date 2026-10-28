import * as fs from 'fs';
import * as path from 'path';

import { normalizeConfiguredCLIPath, parsePathEntries } from './cliPath';
import { getEnhancedPath } from './env';
import { resolveLoginShellPath } from './loginShellPath';

export function isExistingFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function resolveConfiguredCLIPath(configuredPath: string | undefined): string | null {
  try {
    const expandedPath = normalizeConfiguredCLIPath(configuredPath);
    if (!expandedPath) {
      return null;
    }
    return isExistingFile(expandedPath) ? expandedPath : null;
  } catch {
    return null;
  }
}

export function findCLIBinaryPath(binaryName: string): string | null {
  const binaryNames = process.platform === 'win32'
    ? [`${binaryName}.exe`, `${binaryName}.cmd`, binaryName]
    : [binaryName];
  return findBinaryInDirectories(parsePathEntries(getEnhancedPath()), binaryNames);
}

export function findBinaryInDirectories(entries: string[], binaryNames: string[]): string | null {
  for (const dir of entries) {
    if (!dir) continue;

    for (const candidateName of binaryNames) {
      const candidate = path.join(dir, candidateName);
      if (isExistingFile(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/** A configured path is used as given; a search waits for the login shell's PATH, which holds most installs. */
export async function resolveCLI(configuredPath: string | undefined, find: () => string | null): Promise<string | null> {
  const configured = resolveConfiguredCLIPath(configuredPath);
  if (configured) return configured;
  await resolveLoginShellPath();
  return find();
}
