import * as os from 'os';
import * as path from 'path';

function getEnvValue(key: string): string | undefined {
  const hasKey = (name: string): boolean => name in process.env && process.env[name] !== undefined;

  if (hasKey(key)) {
    return process.env[key];
  }

  if (process.platform !== 'win32') {
    return undefined;
  }

  const upper = key.toUpperCase();
  if (hasKey(upper)) {
    return process.env[upper];
  }

  const lower = key.toLowerCase();
  if (hasKey(lower)) {
    return process.env[lower];
  }

  const matchKey = Object.keys(process.env).find((name) => name.toLowerCase() === key.toLowerCase());
  return matchKey ? process.env[matchKey] : undefined;
}

function expandEnvironmentVariables(value: string): string {
  if (!value.includes('%') && !value.includes('$') && !value.includes('!')) {
    return value;
  }

  const isWindows = process.platform === 'win32';
  let expanded = value;

  // Windows %VAR% format - allow parentheses for vars like %ProgramFiles(x86)%
  expanded = expanded.replace(/%([A-Za-z_][A-Za-z0-9_]*(?:\([A-Za-z0-9_]+\))?[A-Za-z0-9_]*)%/g, (match: string, name: string): string => {
    const envValue = getEnvValue(name);
    return envValue !== undefined ? envValue : match;
  });

  if (isWindows) {
    expanded = expanded.replace(/!([A-Za-z_][A-Za-z0-9_]*)!/g, (match: string, name: string): string => {
      const envValue = getEnvValue(name);
      return envValue !== undefined ? envValue : match;
    });

    expanded = expanded.replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (match: string, name: string): string => {
      const envValue = getEnvValue(name);
      return envValue !== undefined ? envValue : match;
    });
  }

  expanded = expanded.replace(/\$([A-Za-z_][A-Za-z0-9_]*)|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match: string, name1: string | undefined, name2: string | undefined): string => {
    const key = name1 ?? name2;
    if (!key) return match;
    const envValue = getEnvValue(key);
    return envValue !== undefined ? envValue : match;
  });

  return expanded;
}

export function expandHomePath(p: string): string {
  const expanded = expandEnvironmentVariables(p);
  if (expanded === '~') {
    return os.homedir();
  }
  if (expanded.startsWith('~/')) {
    return path.join(os.homedir(), expanded.slice(2));
  }
  if (expanded.startsWith('~\\')) {
    return path.join(os.homedir(), expanded.slice(2));
  }
  return expanded;
}

// Translates MSYS/Git Bash paths (/c/Users/...) to Windows paths (C:\Users\...).
// Must be called before path.resolve() or path.isAbsolute().
export function translateMsysPath(value: string): string {
  if (process.platform !== 'win32') {
    return value;
  }

  const msysMatch = value.match(/^\/([a-zA-Z])(\/.*)?$/);
  if (msysMatch) {
    const driveLetter = msysMatch[1].toUpperCase();
    const restOfPath = msysMatch[2] ?? '';
    return `${driveLetter}:${restOfPath.replace(/\//g, '\\')}`;
  }

  return value;
}

