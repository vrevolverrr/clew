const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface ParsedEnv {
  env: Record<string, string>;
  /** The 1-based numbers of the lines that are neither blank, a `#` comment, nor `NAME=value`. */
  invalid: number[];
}

/** Reads `NAME=value` lines. A value may be wrapped in matching quotes; a later line with the same name wins. */
export function parseEnv(text: string): ParsedEnv {
  const env: Record<string, string> = {};
  const invalid: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    const name = eq > 0 ? line.slice(0, eq).trim() : '';
    if (!NAME.test(name)) {
      invalid.push(index + 1);
      return;
    }
    env[name] = unquote(line.slice(eq + 1).trim());
  });
  return { env, invalid };
}

function unquote(value: string): string {
  const quote = value[0];
  return value.length >= 2 && (quote === '"' || quote === '\'') && value.at(-1) === quote ? value.slice(1, -1) : value;
}

/**
 * The environment variables added to every agent process, kept as the text the student typed. `read` and `write`
 * are a secret in Obsidian's secret storage, so the values never reach the plugin's data file.
 */
export class UserEnv {
  constructor(
    private readonly read: () => string | null,
    private readonly write: (text: string) => void,
    /** Called after a save that changed the variables, not one that only changed a comment or a blank line. */
    private readonly onChange: () => void,
  ) {}

  get text(): string {
    return this.read() ?? '';
  }

  set(text: string): void {
    const before = this.resolve();
    this.write(text);
    const after = this.resolve();
    if (Object.keys(before).length !== Object.keys(after).length || Object.entries(after).some(([name, value]) => before[name] !== value)) this.onChange();
  }

  /** Read when a process starts, so it always gets the current text. */
  resolve(): Record<string, string> {
    return parseEnv(this.text).env;
  }
}
