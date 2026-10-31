import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { evalIn, evalJson, obsidian } from './obsidianCli';

// Obsidian has no public API to open or forget a vault; `vault-open` and `vault-remove` are the IPC calls its vault switcher uses.
const NAME = 'clew-figure-bench';
const REGISTRY = path.join(homedir(), 'Library/Application Support/obsidian/obsidian.json');
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Bench vaults Obsidian knows, as [vault id, folder]. */
async function registered(): Promise<[string, string][]> {
  const { vaults } = JSON.parse(await readFile(REGISTRY, 'utf8')) as { vaults: Record<string, { path: string }> };
  return Object.entries(vaults).map(([id, vault]): [string, string] => [id, vault.path]).filter(([, p]) => path.basename(p) === NAME);
}

async function until(what: string, check: () => Promise<boolean>, ms = 20_000): Promise<void> {
  let last = 'not ready';
  for (const end = Date.now() + ms; Date.now() < end; await wait(500)) {
    try {
      if (await check()) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Timed out waiting for ${what}: ${last}`);
}

/** Closes and forgets a bench vault left by an earlier run, then deletes its folder and the caches Obsidian keeps for it. */
export async function teardown(): Promise<void> {
  for (const [id, dir] of await registered()) {
    await evalIn(NAME, 'setTimeout(() => window.close(), 100), "closing"').catch(() => undefined);
    await wait(1500);
    await evalIn(undefined, `String(require('electron').ipcRenderer.sendSync('vault-remove', ${JSON.stringify(dir)}))`);
    // Every vault id gets its own IndexedDB databases in Obsidian's shared origin; they outlive vault-remove.
    await evalIn(undefined, `Promise.all(['-backup', '-cache', '-sync', '-webview'].map((s) => new Promise((done) => {
      const r = indexedDB.deleteDatabase(${JSON.stringify(id)} + s); r.onsuccess = r.onerror = r.onblocked = done;
    }))).then(() => 'ok')`);
    await rm(dir, { recursive: true, force: true });
  }
  if ((await registered()).length) throw new Error(`Could not remove the ${NAME} vault from Obsidian`);
}

/** Builds the plugin into a fresh vault, opens it in its own Obsidian window with Clew on, and returns its name. */
export async function setup(): Promise<string> {
  await obsidian(undefined, 'version').catch(() => { throw new Error('Obsidian is not running, or its CLI is off (Settings → General → Command line interface).'); });
  await teardown();
  const dir = path.join(await realpath(tmpdir()), NAME);
  await mkdir(path.join(dir, '.obsidian/plugins/clew'), { recursive: true });
  await promisify(execFile)('npm', ['run', 'build'], { env: { ...process.env, OBSIDIAN_VAULT: dir }, maxBuffer: 64 << 20 });
  const opened = await evalIn(undefined, `String(require('electron').ipcRenderer.sendSync('vault-open', ${JSON.stringify(dir)}, false))`);
  if (opened !== 'true') throw new Error(`Obsidian did not open the bench vault: ${opened}`);
  await until('the bench vault window', async () => (await evalIn(NAME, 'app.vault.getName()')) === NAME);
  // Chromium slows timers in a background window to about one a minute, and the bench window is usually behind.
  await evalIn(NAME, `require('@electron/remote').getCurrentWebContents().setBackgroundThrottling(false), 'ok'`);
  // `plugins:restrict off` reloads the window and loses an enable sent during the reload; these two calls do not reload.
  await evalIn(NAME, `(async () => { await app.plugins.setEnable(true); await app.plugins.enablePluginAndSave('clew'); return 'ok'; })()`);
  await until('Clew to load', () => evalJson<boolean>(NAME, '!!app.plugins.plugins.clew'));
  return NAME;
}
