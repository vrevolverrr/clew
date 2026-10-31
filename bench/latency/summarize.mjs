// Prints one row per config from a latency bench results file: node bench/latency/summarize.mjs bench/latency/results/results-full.json
import fs from 'fs';

const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const pct = (xs, p) => {
  const s = xs.filter((x) => x !== undefined).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};
const med = (xs) => pct(xs, 0.5);
const fmt = (ms) => (Number.isFinite(ms) ? (ms / 1000).toFixed(2) : '-');

const configs = [...new Set(rows.map((r) => r.config))];
console.log('| config | n | spawn→init | TTFT | 1st action | all actions | turn done | p90 1st | think tok | prompt tok | valid | on-target | $/turn |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const c of configs) {
  const all = rows.filter((r) => r.config === c);
  const warm = c.includes('/warm/');
  // Warm sessions: primer turn absorbs spawn; score only the scenario turns.
  const t = all.filter((r) => r.scenario !== 'primer');
  const actions = t.reduce((n, r) => n + r.actions.length, 0);
  const invalid = t.reduce((n, r) => n + r.invalid.length, 0);
  const prompt = med(t.map((r) => (r.inTok ?? 0) + (r.cacheReadTok ?? 0) + (r.cacheWriteTok ?? 0)));
  console.log(`| ${c} | ${t.length} | ${warm ? fmt(med(all.filter((r) => r.scenario === 'primer').map((r) => r.initMs))) + ' (once)' : fmt(med(t.map((r) => r.initMs)))} | ${fmt(med(t.map((r) => r.ttftMs)))} | ${fmt(med(t.map((r) => r.firstActionMs)))} | ${fmt(med(t.map((r) => r.lastActionMs)))} | ${fmt(med(t.map((r) => r.doneMs)))} | ${fmt(pct(t.map((r) => r.firstActionMs), 0.9))} | ${med(t.map((r) => r.thinkTok))} | ${prompt} | ${actions - invalid}/${actions} | ${t.filter((r) => r.expected).length}/${t.length} | ${(t.reduce((n, r) => n + (r.costUsd ?? 0), 0) / t.length).toFixed(4)} |`);
}

const errs = rows.filter((r) => r.error || r.invalid.length || r.expected === false);
if (errs.length) {
  console.log('\nissues:');
  for (const r of errs) console.log(`- ${r.config} ${r.scenario}: ${[r.error, ...r.invalid, r.expected === false ? 'off-target' : ''].filter(Boolean).join('; ')}`);
}
