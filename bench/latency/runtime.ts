import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function resolveClaudeCli(): string {
  const override = process.env.CLEW_CLAUDE_PATH;
  if (override) return override;
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, 'claude');
    if (dir && fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Claude Code CLI not found on PATH; install it or set CLEW_CLAUDE_PATH');
}

// Running inside a Claude Code session leaks markers that change how a child CLI behaves.
export const childEnv: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^CLAUDE(CODE|_CODE_|_PID|_EFFORT)/.test(k)),
);

export const scratchCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'clew-bench-'));

export const resultsDir = path.join(__dirname, 'results');

export function assistantText(message: SDKMessage): string {
  if (message.type !== 'assistant') return '';
  return message.message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
}
