import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';
import type { ChildProcess, spawn as nodeSpawn } from 'child_process';
import crossSpawn from 'cross-spawn';

import {
  resolveWindowsCmdShimSpawnSpec,
  terminateSpawnedProcess,
  type WindowsCmdShimSpawnSpec,
} from '@/agents/process/windowsCmdShim';

const spawn = crossSpawn as typeof nodeSpawn;

/** Starts the CLI for the SDK, which would otherwise spawn it itself, and hands its stderr to `onStderr`; the SDK reads none from a process it did not start. */
export function spawnClaudeCode(options: SpawnOptions, onStderr: (text: string) => void = () => undefined): SpawnedProcess {
  const { args, command, cwd, env, signal } = options;

  const resolvedSpawnSpec = resolveWindowsCmdShimSpawnSpec({ args, command });

  // Do not pass `signal` directly to spawn() — Obsidian's Electron runtime
  // uses a different realm for AbortSignal, causing `instanceof EventTarget`
  // checks inside Node's internals to fail. Handle abort manually instead.
  const child = spawn(resolvedSpawnSpec.command, resolvedSpawnSpec.args, {
    cwd,
    env: env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  installTreeAwareKill(child, resolvedSpawnSpec);

  if (signal) {
    const killChild = (): void => {
      child.kill('SIGTERM');
    };
    if (signal.aborted) {
      killChild();
    } else {
      signal.addEventListener('abort', killChild, { once: true });
    }
  }

  child.stderr?.on('data', (chunk: Buffer | string) => onStderr(String(chunk)));

  if (!child.stdin || !child.stdout) {
    throw new Error('Failed to create process streams');
  }

  return child as unknown as SpawnedProcess;
}

function installTreeAwareKill(child: ChildProcess, spawnSpec: WindowsCmdShimSpawnSpec): void {
  if (!spawnSpec.killProcessTree) {
    return;
  }

  const originalKill = child.kill.bind(child);
  const callOriginalKill = (signal?: NodeJS.Signals | number): boolean =>
    originalKill(signal);
  const killableChild = {
    get pid(): number | undefined {
      return child.pid;
    },
    kill: callOriginalKill,
  };

  child.kill = ((signal?: NodeJS.Signals | number): boolean =>
    terminateSpawnedProcess(killableChild, signal, spawn, spawnSpec)
  );
}
