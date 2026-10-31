// Renders each scenario turn of one config as the page with the model's actions overlaid.
// node bench/latency/replay.mjs bench/latency/results/results-full.json <config> > replay.html
import fs from 'fs';

const [file, config] = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => r.config === config && r.scenario !== 'primer');
const src = fs.readFileSync(new URL('./bench.ts', import.meta.url), 'utf8');
const blocks = [...src.matchAll(/\{ id: '(b\d+)', kind: '(\w+)', x: (\d+), y: (\d+), w: (\d+), h: (\d+), text: (['"])(.*?)\7 \}/g)]
  .map((m) => ({ id: m[1], kind: m[2], x: +m[3], y: +m[4], w: +m[5], h: +m[6], text: m[8].replace(/\\'/g, "'") }));
const scenarios = Object.fromEntries([...src.matchAll(/id: '(s\d-[\w-]+)', scrollY: (\d+), event: [`'"](.*?)[`'"], expectLabel/g)].map((m) => [m[1], { scrollY: +m[2], event: m[3] }]));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function panel(r) {
  const sc = scenarios[r.scenario];
  const timed = r.actions.map((a, i) => ({ ...a, ms: r.actionMs[i] }));
  const html = blocks.map((b) => {
    let text = esc(b.text);
    for (const h of timed.filter((a) => a.type === 'highlight' && a.block === b.id && b.text.includes(a.quote))) {
      text = text.replace(esc(h.quote), `<mark class="${esc(h.color)}">${esc(h.quote)}</mark>`);
    }
    const notes = timed.filter((a) => a.type === 'annotate' && a.block === b.id)
      .map((a) => `<div class="note" style="top:${b.y}px">${esc(a.text)}<small>${(a.ms / 1000).toFixed(2)}s</small></div>`).join('');
    const scrolled = timed.some((a) => a.type === 'scroll_to' && a.block === b.id) ? ' scrolled' : '';
    return `<div class="blk ${b.kind}${scrolled}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">${text}</div>${notes}`;
  }).join('');
  const svgs = timed.filter((a) => a.type === 'draw_svg')
    .map((a) => `<div class="svg" style="left:${a.x}px;top:${a.y}px;width:${a.width}px;height:${a.height}px">${a.svg}</div>`).join('');
  const says = timed.filter((a) => a.type === 'say').map((a) => `<div class="say">${esc(a.text)} <small>${(a.ms / 1000).toFixed(2)}s</small></div>`).join('');
  const list = timed.map((a) => `<li><b>${(a.ms / 1000).toFixed(2)}s</b> ${a.type} ${a.block ?? ''}</li>`).join('');
  return `<section><h2>${esc(r.scenario)} <small>session ${r.session} · ${r.expected ? 'on target' : 'off target'}${r.invalid.length ? ' · ' + esc(r.invalid.join('; ')) : ''}</small></h2>
<p class="ev">${esc(sc.event)}</p><ol>${list}</ol>${says}
<div class="page"><div class="vp" style="top:${sc.scrollY}px"></div>${html}${svgs}</div></section>`;
}

console.log(`<!doctype html><meta charset="utf-8"><title>Tutor replay</title><style>
body{font:14px system-ui;margin:16px;background:#fafafa;color:#222}section{margin-bottom:32px}
h2{font-size:16px}h2 small,small{color:#888;font-weight:normal}.ev{font-style:italic}
.page{position:relative;width:1000px;height:1280px;background:#fff;border:1px solid #ddd;transform:scale(.6);transform-origin:0 0;margin-bottom:-500px}
.blk{position:absolute;box-sizing:border-box;padding:4px 8px;overflow:hidden}.heading{font-weight:700;font-size:22px}
.figure,.exercise,.callout{border:1px dashed #bbb}.scrolled{outline:3px solid #2a7}
.vp{position:absolute;left:0;width:760px;height:700px;background:rgba(0,90,255,.05);border:2px dashed rgba(0,90,255,.4);box-sizing:border-box}
mark.yellow{background:#ffe86b}mark.green{background:#9ef0a8}mark.pink{background:#ffb3d1}
.note{position:absolute;left:770px;width:220px;background:#fff6c7;border-left:3px solid #e0b400;padding:4px 6px;font-size:13px}
.svg{position:absolute;outline:1px dotted #e33}.svg svg{width:100%;height:100%}
.say{display:inline-block;background:#e8f0ff;border-radius:12px;padding:6px 10px;margin:4px 0}
</style><h1>${esc(config)}</h1>${rows.map(panel).join('')}`);
