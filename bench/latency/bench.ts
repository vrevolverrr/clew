// Live-tutor latency benchmark: the user's own Claude Code CLI driven through the Agent SDK.
// npm run bench -- [--only=<config-substring>] [--smoke] [--out=<file>]
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

import { AsyncQueue } from '../../src/agents/shared/AsyncQueue';
import { childEnv, resolveClaudeCli, resultsDir, scratchCwd } from './runtime';

// ---------------------------------------------------------------- fixture

export interface Block { id: string; kind: string; x: number; y: number; w: number; h: number; text: string }

export const PAGE_W = 760;
export const VIEWPORT_H = 700;
const BLOCKS: Block[] = [
  { id: 'b1', kind: 'heading', x: 40, y: 40, w: 680, h: 48, text: 'The Chain Rule' },
  { id: 'b2', kind: 'paragraph', x: 40, y: 100, w: 680, h: 56, text: 'A composite function h(x) = f(g(x)) feeds the output of an inner function g into an outer function f.' },
  { id: 'b3', kind: 'paragraph', x: 40, y: 168, w: 680, h: 76, text: "Chain rule: h'(x) = f'(g(x)) · g'(x). Differentiate the outer function, keep the inner function unchanged, then multiply by the derivative of the inner function." },
  { id: 'b4', kind: 'heading', x: 40, y: 264, w: 680, h: 36, text: 'Why multiply?' },
  { id: 'b5', kind: 'paragraph', x: 40, y: 308, w: 680, h: 76, text: 'If g changes 3 times as fast as x, and f changes 2 times as fast as g, then f changes 2 × 3 = 6 times as fast as x. Rates of change multiply through each layer.' },
  { id: 'b6', kind: 'figure', x: 180, y: 400, w: 400, h: 220, text: 'Figure 1: Three gears in a row labelled x, g, f. Gear g turns 3 times per turn of x; gear f turns 2 times per turn of g.' },
  { id: 'b7', kind: 'heading', x: 40, y: 640, w: 680, h: 36, text: 'Example 1' },
  { id: 'b8', kind: 'paragraph', x: 40, y: 684, w: 680, h: 76, text: 'd/dx (3x + 1)^5: outer f(u) = u^5, inner g(x) = 3x + 1. Result: 5(3x + 1)^4 · 3 = 15(3x + 1)^4.' },
  { id: 'b9', kind: 'heading', x: 40, y: 780, w: 680, h: 36, text: 'Example 2' },
  { id: 'b10', kind: 'paragraph', x: 40, y: 824, w: 680, h: 76, text: 'd/dx sin(x^2): outer f(u) = sin u, inner g(x) = x^2. Result: cos(x^2) · 2x.' },
  { id: 'b11', kind: 'heading', x: 40, y: 920, w: 680, h: 36, text: 'Practice' },
  { id: 'b12', kind: 'exercise', x: 40, y: 964, w: 680, h: 96, text: 'Exercise 1: Find d/dx sin(3x). [answer box]' },
  { id: 'b13', kind: 'exercise', x: 40, y: 1076, w: 680, h: 96, text: 'Exercise 2: Find d/dx e^(x^2 + 1). [answer box]' },
  { id: 'b14', kind: 'callout', x: 40, y: 1188, w: 680, h: 56, text: 'Common mistake: forgetting to multiply by the derivative of the inner function.' },
];
const PAGE_H = 1280;
const byId = new Map(BLOCKS.map((b) => [b.id, b]));

export interface Action { type: string; [k: string]: unknown }
interface Scenario { id: string; scrollY: number; event: string; expect: (a: Action[]) => boolean; expectLabel: string }

const touches = (a: Action[], ids: string[]): boolean =>
  a.some((x) => ids.includes(String(x.block)) || (x.type === 'draw_svg' && ids.some((id) => overlaps(x, byId.get(id)!))));

function overlaps(a: Action, b: Block): boolean {
  const [x, y, w, h] = [Number(a.x), Number(a.y), Number(a.width), Number(a.height)];
  return x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y;
}

const SCENARIOS: Scenario[] = [
  { id: 's1-why-multiply', scrollY: 0, event: `Student selected the text "f'(g(x)) · g'(x)" in b3 and typed: "why do we multiply by g'(x)??"`, expectLabel: 'acts on b3/b5/b6', expect: (a) => touches(a, ['b3', 'b5', 'b6']) },
  { id: 's2-idle-example', scrollY: 600, event: 'Student has been idle for 45 seconds with the pointer resting on b10. No message typed.', expectLabel: 'acts on b10', expect: (a) => touches(a, ['b10']) },
  { id: 's3-wrong-answer', scrollY: 900, event: 'Student submitted Exercise 1 (b12) answer: "cos(3x)". This is incorrect.', expectLabel: 'acts on b12/b14, no answer leak', expect: (a) => touches(a, ['b12', 'b14']) && !JSON.stringify(a).includes('3cos(3x)') && !JSON.stringify(a).includes('3·cos') },
  { id: 's4-offscreen-def', scrollY: 900, event: 'Student typed: "wait what\'s a composite function again?"', expectLabel: 'scroll_to b2', expect: (a) => a.some((x) => x.type === 'scroll_to' && x.block === 'b2') },
  { id: 's5-sketch-gears', scrollY: 300, event: 'Student typed: "can you show me on the gear picture where the 6 comes from?"', expectLabel: 'draw_svg over b6', expect: (a) => a.some((x) => x.type === 'draw_svg' && overlaps(x, byId.get('b6')!)) },
  { id: 's6-correct-next', scrollY: 900, event: 'Student submitted Exercise 2 (b13) answer: "e^(x^2+1) · 2x" (correct) and typed "ok next?"', expectLabel: 'acts on b13/b14 or says', expect: (a) => touches(a, ['b13', 'b14']) || a.some((x) => x.type === 'say') },
];

function validate(a: Action): string | null {
  const block = a.block === undefined ? null : byId.get(String(a.block));
  switch (a.type) {
    case 'highlight':
      if (!block) return `unknown block ${String(a.block)}`;
      if (typeof a.quote !== 'string' || !block.text.includes(a.quote)) return `quote not in ${block.id}: ${JSON.stringify(a.quote)}`;
      return null;
    case 'annotate':
      if (!block) return `unknown block ${String(a.block)}`;
      return typeof a.text === 'string' && a.text.trim() ? null : 'empty annotation';
    case 'scroll_to':
      return block ? null : `unknown block ${String(a.block)}`;
    case 'say':
      return typeof a.text === 'string' && a.text.trim() ? null : 'empty say';
    case 'draw_svg': {
      const [x, y, w, h] = [a.x, a.y, a.width, a.height].map(Number);
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return 'bad region';
      if (x < 0 || y < 0 || x + w > PAGE_W || y + h > PAGE_H) return 'region off page';
      const svg = String(a.svg ?? '').trim();
      return svg.startsWith('<svg') && svg.endsWith('</svg>') ? null : 'malformed svg';
    }
    default:
      return `unknown action ${a.type}`;
  }
}

// ---------------------------------------------------------------- prompts

export function tutorPrompt(title: string, blocks: Block[], pageH: number): string {
  const pageText = blocks.map((b) => `[${b.id}] ${b.kind} @ (x=${b.x}, y=${b.y}, w=${b.w}, h=${b.h})\n${b.text}`).join('\n\n');
  return `You are a live tutor overlaid on a student's study page in a note-taking app. The student only sees the UI actions you take. Each user message gives the student's viewport and one event. Respond with 1-4 actions that help the student right now. Prefer showing over telling: point at exact text, annotate beside it, sketch over figures, and scroll when the relevant content is offscreen. Keep any "say" under 30 words. Never give away a full exercise answer; hint instead.

Actions:
- highlight {block, quote, color}: quote must be an exact substring of the block's text. color is yellow, green, or pink.
- annotate {block, text}: margin note beside a block, under 20 words.
- draw_svg {x, y, width, height, svg}: overlay an SVG on a region in page coordinates (page is ${PAGE_W}px wide, ${pageH}px tall). svg must be one complete <svg> element with viewBox="0 0 {width} {height}" using only shapes, paths, and text.
- scroll_to {block}: bring a block into view.
- say {text}: chat bubble from the tutor.

<page title="${title}">
${pageText}
</page>`;
}
const BASE_PROMPT = tutorPrompt('The Chain Rule', BLOCKS, PAGE_H);

const JSONL_SUFFIX = `

Output format: one JSON object per line, each {"type": "<action name>", ...fields}. Most important action first. No prose, no code fences, nothing else.`;
const TOOLS_SUFFIX = `

Act only by calling the tools. Call every tool you need in a single response, most important first. Do not write any text.`;

function turnPrompt(s: Scenario): string {
  const visible = BLOCKS.filter((b) => b.y < s.scrollY + VIEWPORT_H && b.y + b.h > s.scrollY).map((b) => b.id);
  return `Viewport: scrollY=${s.scrollY}, height=${VIEWPORT_H} (visible: ${visible.join(', ')})\nEvent: ${s.event}`;
}

const PRIMER = 'Viewport: scrollY=0, height=700 (visible: b1, b2, b3, b4, b5, b6)\nEvent: Student opened the page. Greet them with a single say action.';

// ---------------------------------------------------------------- SDK wiring

const ok = async () => ({ content: [{ type: 'text' as const, text: 'ok' }] });
const tutorServer = () => createSdkMcpServer({
  name: 'tutor',
  version: '1.0.0',
  tools: [
    tool('highlight', 'Highlight an exact substring of a block.', { block: z.string(), quote: z.string(), color: z.enum(['yellow', 'green', 'pink']) }, ok),
    tool('annotate', 'Margin note beside a block, under 20 words.', { block: z.string(), text: z.string() }, ok),
    tool('draw_svg', 'Overlay an SVG on a page-coordinate region. svg uses viewBox="0 0 width height".', { x: z.number(), y: z.number(), width: z.number(), height: z.number(), svg: z.string() }, ok),
    tool('scroll_to', 'Bring a block into view.', { block: z.string() }, ok),
    tool('say', 'Chat bubble from the tutor, under 30 words.', { text: z.string() }, ok),
  ],
});

type Mode = 'jsonl' | 'tools';
// claudian: Claudian's default setting sources (user, project, local), which pull in the user's MCP servers and hooks.
type Settings = 'claudian' | 'lean' | 'safe' | 'bare';
export interface Config { name: string; model: string; mode: Mode; temp: 'cold' | 'warm'; settings: Settings; sessions: number; effort?: Options['effort']; prompt?: string }

function buildOptions(c: Config): Options {
  const options: Options = {
    cwd: scratchCwd,
    systemPrompt: (c.prompt ?? BASE_PROMPT) + (c.mode === 'jsonl' ? JSONL_SUFFIX : TOOLS_SUFFIX),
    model: c.model,
    pathToClaudeCodeExecutable: resolveClaudeCli(),
    env: childEnv,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    settingSources: c.settings === 'claudian' ? ['user', 'project', 'local'] : [],
    includePartialMessages: true,
    persistSession: false,
    thinking: { type: 'disabled' },
    tools: [],
  };
  if (c.mode === 'tools') options.mcpServers = { tutor: tutorServer() };
  if (c.settings !== 'claudian') options.strictMcpConfig = true;
  if (c.settings === 'safe') options.extraArgs = { 'safe-mode': null };
  if (c.settings === 'bare') {
    // --bare refuses bypassPermissions; with no built-in tools there is nothing to approve anyway.
    options.extraArgs = { bare: null };
    options.permissionMode = 'default';
    delete options.allowDangerouslySkipPermissions;
  }
  if (c.effort) options.effort = c.effort;
  return options;
}

// ---------------------------------------------------------------- turn measurement

export interface TurnResult {
  config: string; session: number; scenario: string; model?: string;
  initMs?: number; ttftMs?: number; firstActionMs?: number; lastActionMs?: number; doneMs: number; apiMs?: number;
  actions: Action[]; actionMs: number[]; invalid: string[]; expected: boolean | null;
  inTok?: number; cacheReadTok?: number; cacheWriteTok?: number; outTok?: number; costUsd?: number;
  mcpServers?: string[]; toolCount?: number; error?: string; thinkTok?: number; trace: string[];
}

export class Session {
  private channel = new AsyncQueue<SDKUserMessage>();
  private query: Query;
  private iter: AsyncIterator<SDKMessage>;
  private lastCost = 0;
  private sessionId = '';
  model?: string; mcpServers?: string[]; toolCount?: number;
  initAt?: number;
  readonly startedAt = performance.now();

  constructor(private c: Config) {
    this.query = query({ prompt: this.channel, options: buildOptions(c) });
    this.iter = this.query[Symbol.asyncIterator]();
  }

  async turn(text: string, scenarioId: string, session: number): Promise<TurnResult> {
    const t0 = performance.now();
    const rel = () => Math.round(performance.now() - t0);
    const r: TurnResult = { config: this.c.name, session, scenario: scenarioId, doneMs: 0, actions: [], actionMs: [], invalid: [], expected: null, trace: [] };
    const push = (a: Action) => { r.actions.push(a); r.actionMs.push(rel()); };
    let lineBuf = '';
    const flushLines = (final: boolean) => {
      const lines = lineBuf.split('\n');
      lineBuf = final ? '' : lines.pop()!;
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('```')) continue;
        try { push(JSON.parse(line)); } catch { r.invalid.push(`unparseable line: ${line.slice(0, 80)}`); }
      }
    };
    const toolBlocks = new Map<number, { name: string; json: string }>();

    this.channel.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: this.sessionId, uuid: randomUUID() });
    for (;;) {
      const next = await this.iter.next();
      if (next.done) { r.error = 'stream ended'; break; }
      const m = next.value;
      if (m.type === 'system' && m.subtype === 'init') {
        this.initAt ??= performance.now();
        r.initMs = Math.round(this.initAt - this.startedAt);
        this.sessionId = m.session_id;
        this.model = m.model;
        this.mcpServers = m.mcp_servers.map((s) => `${s.name}:${s.status}`);
        this.toolCount = m.tools.length;
      } else if (m.type === 'stream_event' && m.parent_tool_use_id === null) {
        const e = m.event;
        if (e.type === 'content_block_delta' && r.ttftMs === undefined) r.ttftMs = rel();
        if (e.type === 'content_block_delta' || e.type === 'content_block_start' || e.type === 'message_start') r.trace.push(`${rel()} ${e.type === 'content_block_delta' ? e.delta.type + ':' + JSON.stringify((e.delta as { text?: string; partial_json?: string; thinking?: string }).text ?? (e.delta as { partial_json?: string }).partial_json ?? (e.delta as { thinking?: string }).thinking ?? '').slice(0, 40) : e.type}`);
        if (e.type === 'content_block_start' && e.content_block.type === 'tool_use') toolBlocks.set(e.index, { name: e.content_block.name, json: '' });
        if (e.type === 'content_block_delta' && e.delta.type === 'input_json_delta') toolBlocks.get(e.index)!.json += e.delta.partial_json;
        if (e.type === 'content_block_delta' && e.delta.type === 'text_delta' && this.c.mode === 'jsonl') { lineBuf += e.delta.text; flushLines(false); }
        if (e.type === 'content_block_stop' && toolBlocks.has(e.index)) {
          const b = toolBlocks.get(e.index)!;
          toolBlocks.delete(e.index);
          try { push({ type: b.name.replace(/^mcp__tutor__/, ''), ...JSON.parse(b.json || '{}') }); } catch { r.invalid.push(`bad tool json ${b.name}`); }
        }
        if (e.type === 'message_stop' && this.c.mode === 'jsonl') flushLines(true);
      } else if (m.type === 'result') {
        r.doneMs = rel();
        r.apiMs = m.duration_api_ms;
        r.inTok = m.usage.input_tokens; r.cacheReadTok = m.usage.cache_read_input_tokens; r.cacheWriteTok = m.usage.cache_creation_input_tokens; r.outTok = m.usage.output_tokens; r.thinkTok = (m.usage as { output_tokens_details?: { thinking_tokens?: number } }).output_tokens_details?.thinking_tokens;
        r.costUsd = +(m.total_cost_usd - this.lastCost).toFixed(5);
        this.lastCost = m.total_cost_usd;
        if (m.subtype !== 'success') r.error = m.subtype;
        break;
      }
    }
    if (this.c.mode === 'jsonl') flushLines(true);
    r.firstActionMs = r.actionMs[0];
    r.lastActionMs = r.actionMs.at(-1);
    Object.assign(r, { model: this.model, mcpServers: this.mcpServers, toolCount: this.toolCount });
    return r;
  }

  close(): void { this.channel.close(); this.query.close(); }
}

// ---------------------------------------------------------------- run

const CONFIGS: Config[] = [
  { name: 'haiku/cold/jsonl/claudian', model: 'haiku', mode: 'jsonl', temp: 'cold', settings: 'claudian', sessions: 1 },
  { name: 'haiku/cold/jsonl/lean', model: 'haiku', mode: 'jsonl', temp: 'cold', settings: 'lean', sessions: 1 },
  { name: 'haiku/cold/jsonl/lean+low', model: 'haiku', mode: 'jsonl', temp: 'cold', settings: 'lean', sessions: 1, effort: 'low' },
  { name: 'haiku/cold/tools/lean+low', model: 'haiku', mode: 'tools', temp: 'cold', settings: 'lean', sessions: 1, effort: 'low' },
  { name: 'haiku/warm/jsonl/claudian', model: 'haiku', mode: 'jsonl', temp: 'warm', settings: 'claudian', sessions: 1 },
  { name: 'haiku/warm/jsonl/lean+low', model: 'haiku', mode: 'jsonl', temp: 'warm', settings: 'lean', sessions: 2, effort: 'low' },
  { name: 'haiku/warm/tools/lean+low', model: 'haiku', mode: 'tools', temp: 'warm', settings: 'lean', sessions: 2, effort: 'low' },
  { name: 'sonnet/warm/jsonl/lean+low', model: 'sonnet', mode: 'jsonl', temp: 'warm', settings: 'lean', sessions: 1, effort: 'low' },
  { name: 'sonnet/warm/tools/lean+low', model: 'sonnet', mode: 'tools', temp: 'warm', settings: 'lean', sessions: 1, effort: 'low' },
  { name: 'haiku/cold/jsonl/safe+low', model: 'haiku', mode: 'jsonl', temp: 'cold', settings: 'safe', sessions: 1, effort: 'low' },
  { name: 'haiku/warm/jsonl/safe+low', model: 'haiku', mode: 'jsonl', temp: 'warm', settings: 'safe', sessions: 2, effort: 'low' },
  { name: 'sonnet/warm/jsonl/safe+low', model: 'sonnet', mode: 'jsonl', temp: 'warm', settings: 'safe', sessions: 3, effort: 'low' },
];

function check(r: TurnResult, s: Scenario): TurnResult {
  for (const a of r.actions) { const v = validate(a); if (v) r.invalid.push(v); }
  r.expected = s.expect(r.actions);
  return r;
}

async function main(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const smoke = process.argv.includes('--smoke');
  const configs = CONFIGS.filter((c) => !only || c.name.includes(only));
  const scenarios = smoke ? SCENARIOS.slice(0, 2) : SCENARIOS;
  const results: TurnResult[] = [];
  const log = (r: TurnResult) => {
    results.push(r);
    console.log(`${r.config.padEnd(28)} ${r.scenario.padEnd(18)} init=${r.initMs ?? '-'} ttft=${r.ttftMs} first=${r.firstActionMs} last=${r.lastActionMs} done=${r.doneMs} n=${r.actions.length} invalid=${r.invalid.length} exp=${r.expected} ${r.error ?? ''}`);
  };

  for (const c of configs) {
    if (c.temp === 'cold') {
      for (const s of scenarios) {
        const session = new Session(c);
        try { log(check(await session.turn(turnPrompt(s), s.id, 0), s)); } finally { session.close(); }
      }
    } else {
      for (let i = 0; i < (smoke ? 1 : c.sessions); i++) {
        const session = new Session(c);
        try {
          log(await session.turn(PRIMER, 'primer', i));
          for (const s of scenarios) log(check(await session.turn(turnPrompt(s), s.id, i), s));
        } finally { session.close(); }
      }
    }
  }

  const out = path.join(resultsDir, process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? `results-${smoke ? 'smoke' : 'full'}.json`);
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`wrote ${out}`);
}

if (process.argv[1]?.endsWith('bench.ts')) main().catch((e) => { console.error(e); process.exit(1); });
