import esbuild from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, promises as fsPromises, readFileSync } from 'fs';
import { builtinModules } from 'node:module';
import path from 'path';
import process from 'process';

import rendererSafeUnrefHelpers from './scripts/rendererSafeUnref.js';

const { findUnsafeTimerUnrefSites, patchRendererUnsafeUnrefSites } = rendererSafeUnrefHelpers;

// OBSIDIAN_VAULT=/path/to/vault in .env.local copies each build into that vault's plugin folder.
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const match = line.match(/^([^=]+)=["']?(.+?)["']?$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const prod = process.argv[2] === 'production';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getNamedImportAliases(contents, exportName, moduleNames) {
  const aliases = new Set([exportName]);
  const importPattern = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  let match;
  while ((match = importPattern.exec(contents)) !== null) {
    const [, specifiers, moduleName] = match;
    if (!moduleNames.includes(moduleName)) continue;
    for (const specifier of specifiers.split(',')) {
      const parts = specifier.trim().split(/\s+as\s+/);
      if (parts[0] === exportName) aliases.add(parts[1] ?? exportName);
    }
  }
  return [...aliases];
}

// The SDK is ESM and resolves its own files through import.meta.url, which is undefined in a CJS plugin bundle.
function patchSdkImportMetaUrl(contents) {
  let patched = contents.replace('createRequire(import.meta.url)', 'createRequire(__filename)');
  for (const alias of getNamedImportAliases(patched, 'createRequire', ['module', 'node:module'])) {
    patched = patched.replace(new RegExp(`\\b${escapeRegExp(alias)}\\(import\\.meta\\.url\\)`, 'g'), `${alias}(__filename)`);
  }
  for (const alias of getNamedImportAliases(patched, 'fileURLToPath', ['url', 'node:url'])) {
    patched = patched.replace(new RegExp(`\\b${escapeRegExp(alias)}\\(import\\.meta\\.url\\)`, 'g'), '__filename');
  }
  return patched;
}

const patchSdkImportMeta = {
  name: 'patch-sdk-import-meta',
  setup(build) {
    build.onLoad(
      { filter: /[\\/]node_modules[\\/](?:@anthropic-ai[\\/]claude-agent-sdk[\\/](?:sdk|core(?:-[A-Za-z0-9]+)?)\.mjs)$/ },
      async (args) => ({ contents: patchSdkImportMetaUrl(await fsPromises.readFile(args.path, 'utf8')), loader: 'js' }),
    );
  },
};

// The SDK `/core` entry imports zod and the MCP SDK only for createSdkMcpServer(), which the plugin does not use.
const omitUnusedClaudeSdkPeers = {
  name: 'omit-unused-claude-sdk-peers',
  setup(build) {
    build.onResolve({ filter: /^(?:zod|@modelcontextprotocol\/sdk)(?:\/|$)/ }, async (args) => {
      if (args.pluginData?.omitUnusedClaudeSdkPeers) return undefined;
      if (!/[\\/]node_modules[\\/]@anthropic-ai[\\/]claude-agent-sdk[\\/]/.test(args.importer)) return undefined;
      const result = await build.resolve(args.path, {
        importer: args.importer,
        kind: args.kind,
        pluginData: { omitUnusedClaudeSdkPeers: true },
        resolveDir: args.resolveDir,
      });
      return result.errors.length > 0 ? result : { ...result, sideEffects: false };
    });
  },
};

// zod re-exports every locale as `z.locales`, which esbuild cannot tree-shake (evanw/esbuild#1420).
// Clew shows no zod messages, and zod itself loads only `en`.
const englishOnlyZodLocales = {
  name: 'english-only-zod-locales',
  setup(build) {
    build.onLoad({ filter: /[\\/]node_modules[\\/]zod[\\/]v4[\\/]locales[\\/][^\\/]+\.c?js$/ }, (args) => {
      const file = path.basename(args.path);
      if (file === 'index.js') return { contents: 'export { default as en } from "./en.js";', loader: 'js' };
      if (file === 'en.js') return undefined;
      throw new Error(`zod locale ${file} reached the bundle; update englishOnlyZodLocales for the new import path`);
    });
  },
};

// Renderer timers return numbers, so Node-style `.unref()` calls in bundled dependencies throw inside Obsidian.
const patchRendererUnsafeUnref = {
  name: 'patch-renderer-unsafe-unref',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0 || !existsSync('main.js')) return;
      const original = await fsPromises.readFile('main.js', 'utf8');
      const patched = patchRendererUnsafeUnrefSites(original);
      if (patched.contents !== original) await fsPromises.writeFile('main.js', patched.contents, 'utf8');
      const unsafe = findUnsafeTimerUnrefSites(patched.contents);
      if (unsafe.length > 0) {
        const details = unsafe.slice(0, 5).map((m) => `line ${m.line}: ${m.snippet}`).join('\n');
        throw new Error(`Renderer-unsafe timer .unref() calls remain in main.js:\n${details}`);
      }
    });
  },
};

const vault = process.env.OBSIDIAN_VAULT;
const pluginDir = vault && existsSync(vault) ? path.join(vault, '.obsidian', 'plugins', 'clew') : null;

const copyToObsidian = {
  name: 'copy-to-obsidian',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0 || !pluginDir) return;
      mkdirSync(pluginDir, { recursive: true });
      for (const file of ['main.js', 'manifest.json', 'styles.css']) {
        if (existsSync(file)) {
          copyFileSync(file, path.join(pluginDir, file));
          console.log(`Copied ${file} to ${pluginDir}`);
        }
      }
    });
  },
};

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  plugins: [patchSdkImportMeta, omitUnusedClaudeSdkPeers, englishOnlyZodLocales, patchRendererUnsafeUnref, copyToObsidian],
  // Obsidian provides CodeMirror and the lezer core at runtime, as its sample plugin's build config assumes. A second
  // copy of CodeMirror in the bundle would not recognise the editor's own extensions and state.
  external: ['obsidian', 'electron', '@codemirror/state', '@codemirror/view', '@lezer/common', '@lezer/highlight', ...builtinModules, 'node:*'],
  format: 'cjs',
  target: 'es2022',
  charset: 'utf8',
  logLevel: 'info',
  minify: prod,
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
