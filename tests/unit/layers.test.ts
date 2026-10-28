import { readdirSync, readFileSync } from 'fs';
import { join, posix } from 'path';

const SRC = join(__dirname, '../../src');

/**
 * Where a file sits in the dependency hierarchy. Host code, which may use the Obsidian API and the editor, is exactly the
 * code in an `obsidian/` folder (and `main.ts`). A module (`attachments/`, `tour/`, `settings/`, `renderer/markdown/`,
 * `renderer/mermaid/`) is split into `module` (its root: no host, no DOM), `module/view` (DOM widgets) and `module/obsidian`.
 * Modules sit above the chat model and context, which never import one. `renderer/openui/` is the `renderer` zone, at the
 * bottom, since context and tools describe its language. Each zone lists the zones it may import; anything else fails.
 */
type Zone =
  | 'main'
  | 'chat/obsidian'
  | 'chat/view'
  | 'module'
  | 'module/view'
  | 'module/obsidian'
  | 'shared'
  | 'shared/view'
  | 'shared/obsidian'
  | 'context/obsidian'
  | 'chat'
  | 'context'
  | 'renderer'
  | 'tools'
  | 'agents';

const SHARED: Zone[] = ['shared', 'shared/view', 'shared/obsidian'];

const ALLOWED: Record<Zone, Zone[]> = {
  main: ['main', 'chat/obsidian', 'chat/view', 'module', 'module/view', 'module/obsidian', ...SHARED, 'context/obsidian', 'chat', 'context', 'renderer', 'tools', 'agents'],
  'chat/obsidian': ['chat/obsidian', 'chat/view', 'module', 'module/view', 'module/obsidian', ...SHARED, 'context/obsidian', 'chat', 'context', 'renderer', 'agents'],
  'chat/view': ['chat/view', 'module', 'module/view', 'shared', 'shared/view', 'chat', 'context', 'renderer', 'agents'],
  'module/obsidian': ['module', 'module/view', 'module/obsidian', ...SHARED, 'chat', 'context', 'agents'],
  'module/view': ['module', 'module/view', 'shared', 'shared/view', 'chat', 'context'],
  module: ['module', 'chat', 'context', 'shared', 'agents'],
  shared: ['shared', 'agents', 'renderer'],
  'shared/view': ['shared/view', 'shared'],
  'shared/obsidian': ['shared/obsidian', 'shared'],
  'context/obsidian': ['context/obsidian', 'shared/obsidian', 'shared', 'context'],
  chat: ['chat', 'context', 'shared', 'agents', 'renderer', 'tools'],
  context: ['context', 'shared', 'agents', 'renderer'],
  renderer: ['renderer'],
  tools: ['tools', 'agents', 'renderer'],
  agents: ['agents'],
};

const HOST: Zone[] = ['main', 'chat/obsidian', 'module/obsidian', 'shared/obsidian', 'context/obsidian'];
/** The one file outside the host zones that imports Obsidian, for its icon set. */
const ICONS = 'shared/view/icon.ts';
const NO_DOM: Zone[] = ['chat', 'context', 'shared', 'module', 'tools'];
const MODULES = new Set(['attachments', 'tour', 'settings', 'renderer/markdown', 'renderer/mermaid']);

function sources(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.ts'));
}

function zoneOf(file: string): Zone {
  const [top, second] = file.split('/');
  if (file === 'main.ts') return 'main';
  if (top === 'chat') return second === 'view' ? 'chat/view' : second === 'obsidian' ? 'chat/obsidian' : 'chat';
  if (top === 'shared') return second === 'view' || second === 'obsidian' ? `shared/${second}` as Zone : 'shared';
  if (top === 'context') return second === 'obsidian' ? 'context/obsidian' : 'context';
  const owner = moduleOf(file);
  if (owner) {
    const part = file.slice(owner.length + 1).split('/')[0];
    return part === 'view' || part === 'obsidian' ? `module/${part}` as Zone : 'module';
  }
  return top as Zone;
}

/** The module a file belongs to, or null outside one. */
function moduleOf(file: string): string | null {
  const parts = file.split('/');
  return [parts[0]!, parts.slice(0, 2).join('/')].find((name) => MODULES.has(name)) ?? null;
}

/** Every module a file imports, with the names it takes from it. */
function imports(file: string): { from: string; names: string }[] {
  const text = readFileSync(join(SRC, file), 'utf8');
  return [...text.matchAll(/(?:import|export)\s+(?:type\s+)?([^'";]*?)\s*from\s*'([^']+)'/g)].map((match) => ({ from: match[2]!, names: match[1]! }));
}

const files = sources();
const isHostModule = (from: string): boolean => from === 'obsidian' || from.startsWith('@codemirror/');

function importTarget(file: string, from: string): string | undefined {
  const target = from.startsWith('@/') ? from.slice(2) : from.startsWith('.') ? posix.join(posix.dirname(file), from) : undefined;
  return target === undefined ? undefined : posix.normalize(target).replace(/\.(?:ts|js)$/, '') + '.ts';
}

const providerAdapters = files.filter((file) => /^agents\/[^/]+\/\w+(?:Model|Tool|Permission)Adapter\.ts$/.test(file));

describe('layers', () => {
  it.each([
    ['chat/view/Card.ts', '@/agents/claude/ClaudeToolAdapter', 'agents/claude/ClaudeToolAdapter.ts'],
    ['chat/view/Card.ts', '../../agents/codex/CodexPermissionAdapter.js', 'agents/codex/CodexPermissionAdapter.ts'],
    ['agents/claude/ClaudeToolAdapter.ts', './ClaudeModelAdapter.ts', 'agents/claude/ClaudeModelAdapter.ts'],
  ])('resolves internal import %s -> %s', (file, from, target) => {
    expect(importTarget(file, from)).toBe(target);
  });

  it('keeps specialized provider adapters inside agents', () => {
    const bad = files.filter((file) => !file.startsWith('agents/')).flatMap((file) =>
      imports(file).filter(({ from }) => providerAdapters.includes(importTarget(file, from) ?? '')).map(({ from }) => ({ file, from })));
    expect(bad).toEqual([]);
  });

  it('keeps specialized adapters independent of siblings and provider runtimes', () => {
    expect(providerAdapters.length).toBeGreaterThan(0);
    expect(providerAdapters.length % 3).toBe(0);
    const forbidden = new Set([...providerAdapters, ...files.filter((file) => /^agents\/[^/]+\/\w+Agent\.ts$/.test(file))]);
    const bad = providerAdapters.flatMap((file) =>
      imports(file).filter(({ from }) => forbidden.has(importTarget(file, from) ?? '')).map(({ from }) => ({ file, from })));
    expect(bad).toEqual([]);
  });
  it('reaches agents/ only through its contract and catalogue', () => {
    const contract = new Set(['agents/types.ts', 'agents/providers.ts']);
    const bad = files.filter((file) => !file.startsWith('agents/')).flatMap((file) =>
      imports(file).map(({ from }) => importTarget(file, from) ?? '').filter((target) => target.startsWith('agents/') && !contract.has(target)).map((target) => ({ file, target })));
    expect(bad).toEqual([]);
  });

  it('keeps provider names in agents/ code', () => {
    const named = files.filter((file) => !file.startsWith('agents/')).filter((file) => {
      const code = readFileSync(join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      return /claude|codex|anthropic|openai/i.test(code);
    });
    expect(named).toEqual([]);
  });

  it.each(files)('%s imports only what its zone may', (file) => {
    const zone = zoneOf(file);
    const own = moduleOf(file);
    const bad = imports(file)
      .filter(({ from }) => from.startsWith('@/'))
      .map(({ from }) => `${from.slice(2)}.ts`)
      .filter((target) => {
        const other = files.find((candidate) => candidate === target || candidate === target.replace(/\.ts$/, '/index.ts'));
        if (!other) return false;
        if (!ALLOWED[zone].includes(zoneOf(other))) return true;
        const otherModule = moduleOf(other);
        return own !== null && otherModule !== null && otherModule !== own;
      });
    expect(bad).toEqual([]);
  });

  it.each(files)('%s is host code exactly when it sits in an obsidian/ folder', (file) => {
    expect(HOST.includes(zoneOf(file))).toBe(file === 'main.ts' || file.split('/').slice(0, -1).includes('obsidian'));
  });

  it.each(files.filter((file) => !HOST.includes(zoneOf(file)) && file !== ICONS))('%s takes no host module', (file) => {
    expect(imports(file).filter(({ from }) => isHostModule(from))).toEqual([]);
  });

  it(`lets ${ICONS} take only setIcon from Obsidian`, () => {
    expect(imports(ICONS)).toEqual([{ from: 'obsidian', names: '{ setIcon }' }]);
  });

  it.each(files.filter((file) => NO_DOM.includes(zoneOf(file))))('%s does not touch document', (file) => {
    const text = readFileSync(join(SRC, file), 'utf8');
    expect(text.match(/\bdocument\./g) ?? []).toEqual([]);
  });
});
