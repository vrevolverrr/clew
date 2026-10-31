import { spawn } from 'node:child_process';

const TIMEOUT_MS = 60_000;
/** How long a complete result must sit unchanged before a CLI that has not exited is taken to be stuck. */
const SETTLED_MS = 1_000;

/** Output that ends a command: an eval's `=> …` line, or the JSON a `dev:` command prints. */
function complete(out: string): boolean {
  if (/^=> /m.test(out) || /^Error:/m.test(out)) return true;
  try {
    JSON.parse(out);
    return true;
  } catch {
    return false;
  }
}

/** Runs one `obsidian` CLI command, in `vault` when given; the CLI prints `Error: …` and exits 0 when a command fails. */
export async function obsidian(vault: string | undefined, ...args: string[]): Promise<string> {
  // The CLI ignores SIGTERM, and a screenshot of a window the OS is not drawing waits forever. It also sometimes prints
  // its result and never exits, so a complete result that has settled is taken and the process killed.
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn('obsidian', vault ? [`vault=${vault}`, ...args] : args);
    let out = '';
    let settle: NodeJS.Timeout | undefined;
    const done = (error?: Error): void => {
      clearTimeout(timeout);
      clearTimeout(settle);
      child.kill('SIGKILL');
      if (error) reject(error);
      else resolve(out);
    };
    const timeout = setTimeout(() => done(new Error(`obsidian ${args[0]}: no result in ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      clearTimeout(settle);
      if (complete(out.trim())) settle = setTimeout(() => done(), SETTLED_MS);
    });
    child.on('error', (error) => done(error));
    child.on('close', () => done());
  });
  // Console lines the window logged during the command (`[error] …`) come before the result.
  const out = stdout.trim();
  const error = out.match(/^Error:.*$/m);
  if (error) throw new Error(`obsidian ${args[0]}: ${error[0]}`);
  const result = out.match(/^=> ([\s\S]*)$/m);
  return result ? result[1] : out;
}

/** Evaluates `code` in the vault's window; a value it returns comes back as a string. */
export const evalIn = (vault: string | undefined, code: string): Promise<string> => obsidian(vault, 'eval', `code=${code}`);

/** Evaluates an expression whose value is JSON-serialisable, awaiting it if it is a promise. */
export async function evalJson<T>(vault: string | undefined, expression: string): Promise<T> {
  const out = await evalIn(vault, `(async () => JSON.stringify((await (${expression})) ?? null))()`);
  return JSON.parse(out) as T;
}

export async function cdp<T>(vault: string, method: string, params: object): Promise<T> {
  return JSON.parse(await obsidian(vault, 'dev:cdp', `method=${method}`, `params=${JSON.stringify(params)}`)) as T;
}
