import { access, readdir, readFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/**
 * The title Claude Code gave a conversation: the one the student set with /rename, else the one it wrote itself.
 * The SDK's `getSessionInfo` reads the same entries, but only its full entry point exports it and that is over a
 * megabyte of bundle. Sessions are filed by project folder, so the id is looked for in each.
 */
export async function claudeSessionTitle(sessionId: string, configDir = claudeConfigDir()): Promise<string | undefined> {
  const transcript = await transcriptPath(sessionId, configDir);
  return transcript === null ? undefined : titleIn(await readFile(transcript, 'utf8'));
}

/** Whether Claude Code still has the conversation, read from its files rather than from its error text. */
export async function claudeSessionExists(sessionId: string, configDir = claudeConfigDir()): Promise<boolean> {
  return await transcriptPath(sessionId, configDir) !== null;
}

/** The folder the CLI reads, which the student's own environment variables may move. */
export function claudeConfigDir(env: Record<string, string> = {}): string {
  return env.CLAUDE_CONFIG_DIR || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

async function transcriptPath(sessionId: string, configDir: string): Promise<string | null> {
  const projects = path.join(configDir, 'projects');
  for (const folder of await readdir(projects).catch(() => [])) {
    const transcript = path.join(projects, folder, `${sessionId}.jsonl`);
    if (await access(transcript).then(() => true, () => false)) return transcript;
  }
  return null;
}

/** Later entries win, and a rename wins over the generated title. */
function titleIn(transcript: string): string | undefined {
  let custom: string | undefined;
  let generated: string | undefined;
  for (const line of transcript.split('\n')) {
    if (!line.includes('Title"')) continue;
    try {
      const entry = JSON.parse(line) as { customTitle?: unknown; aiTitle?: unknown };
      custom = nonBlank(entry.customTitle) ?? custom;
      generated = nonBlank(entry.aiTitle) ?? generated;
    } catch {
      // A line cut short by a write in progress is not a title.
    }
  }
  return custom ?? generated;
}

function nonBlank(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
