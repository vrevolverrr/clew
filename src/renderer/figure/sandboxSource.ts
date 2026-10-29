export { default as WORKER_SOURCE } from 'figure-worker';

/** The figure iframe's policy: its own code inline, workers from blobs, and no network. Change it only with the probe rerun. */
export const SANDBOX_CSP = "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'";

// Runs in the iframe: keeps the worker source as one blob URL and runs each request in a fresh Worker under a deadline.
const BOOTSTRAP = `
let url;
addEventListener('message', (event) => {
  if (event.source !== parent) return;
  const message = event.data;
  if (message.type === 'source') {
    url = URL.createObjectURL(new Blob([message.source], { type: 'text/javascript' }));
    parent.postMessage({ type: 'ready' }, '*');
    return;
  }
  if (message.type !== 'run') return;
  const worker = new Worker(url);
  let done = false;
  const finish = (payload) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    worker.terminate();
    parent.postMessage({ type: 'result', id: message.id, payload }, '*');
  };
  const timer = setTimeout(() => finish({ error: { message: 'The figure took too long (over 2 s)', timeout: true } }), message.ms);
  worker.onmessage = (reply) => finish(reply.data);
  worker.onerror = (error) => { error.preventDefault(); finish({ error: { message: String(error.message || 'The figure could not run') } }); };
  worker.postMessage(message.request);
});
`;

const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"><script>${BOOTSTRAP}</script>`;

/** A fixed `data:` document rather than `srcdoc`: Chromium puts it in its own process, apart from every `srcdoc` frame. */
export const SANDBOX_URL = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
