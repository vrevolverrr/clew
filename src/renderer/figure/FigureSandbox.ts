import { LIMITS } from '@/renderer/figure/FigureData';
import { SANDBOX_URL, WORKER_SOURCE } from '@/renderer/figure/sandboxSource';

export type RunResult =
  | { ok: true; payload: unknown } // untrusted: validateFigure reads it
  | { ok: false; error: string; line?: number; repairable: boolean };

const COULD_NOT_RUN = 'The figure could not run';
const NOT_ISOLATED = 'Figures are disabled: the sandbox is not isolated in this Obsidian build';
const BLOCKED = 'Figures are disabled: this Obsidian build blocks running them';
const CANCELLED: RunResult = { ok: false, error: 'The figure was stopped', repairable: false };

interface Queued {
  source: string;
  params: Record<string, unknown>;
  near: () => number;
  settle(result: RunResult): void;
  /** Set once the run has gone back in the queue after the sandbox was reset under it. */
  retried?: boolean;
}

interface Posted {
  reply(payload: unknown): void;
  fail(error: string): void;
}

type Plain = Record<string, unknown>;
const isObject = (value: unknown): value is Plain => typeof value === 'object' && value !== null;
const own = (object: Plain, key: string): unknown => (Object.hasOwn(object, key) ? object[key] : undefined);

/**
 * Runs figure programs in one invisible `<iframe sandbox="allow-scripts">` with an opaque origin, each in a fresh Worker
 * the iframe starts. Never a Worker from plugin code: one started here has Node.
 */
export class FigureSandbox {
  private iframe?: HTMLIFrameElement;
  private starting?: Promise<void>;
  private ready = false;
  private disabled?: string;
  private onReady?: () => void;
  private listening = false;
  private nextId = 0;
  private readonly queue: Queued[] = [];
  private readonly posted = new Map<number, Posted>();

  /** Creates the iframe ahead of the first run, so its start hides under the stream. */
  warm(): void {
    void this.start();
  }

  /** An abort drops a queued run, or ignores the reply of a posted one, and resolves it as not repairable. */
  run(source: string, params: Record<string, unknown>, near: () => number, signal?: AbortSignal): Promise<RunResult> {
    if (source.length > LIMITS.source) return Promise.resolve({ ok: false, error: 'The figure program is over 64 KiB', repairable: true });
    if (signal?.aborted) return Promise.resolve(CANCELLED);
    return new Promise((resolve) => {
      let done = false;
      const onAbort = (): void => {
        const at = this.queue.indexOf(entry);
        if (at >= 0) this.queue.splice(at, 1);
        entry.settle(CANCELLED);
      };
      const entry: Queued = {
        source,
        params,
        near,
        settle: (result) => {
          if (done) return;
          done = true;
          signal?.removeEventListener('abort', onAbort);
          resolve(result);
        },
      };
      signal?.addEventListener('abort', onAbort);
      this.queue.push(entry);
      void this.start().then(() => this.pump());
    });
  }

  /** Removes the iframe and fails what is pending; the next run starts a new one. */
  destroy(): void {
    if (this.listening) window.removeEventListener('message', this.onMessage);
    this.listening = false;
    this.disabled = undefined;
    this.reset(COULD_NOT_RUN);
  }

  private readonly onMessage = (event: MessageEvent): void => {
    if (!this.iframe || event.source !== this.iframe.contentWindow) return;
    const data: unknown = event.data;
    if (!isObject(data)) return;
    const type = own(data, 'type');
    if (type === 'ready') {
      this.onReady?.();
      return;
    }
    const id = own(data, 'id');
    if (type !== 'result' || typeof id !== 'number') return;
    const posted = this.posted.get(id);
    if (!posted) return;
    this.posted.delete(id);
    posted.reply(own(data, 'payload'));
  };

  private start(): Promise<void> {
    if (this.ready || this.disabled) return Promise.resolve();
    if (!this.starting) {
      const starting: Promise<void> = this.boot().finally(() => {
        if (this.starting === starting) this.starting = undefined;
      });
      this.starting = starting;
    }
    return this.starting;
  }

  private async boot(): Promise<void> {
    if (!this.listening) window.addEventListener('message', this.onMessage);
    this.listening = true;
    const iframe = createEl('iframe');
    // Never allow-same-origin: it would make the iframe the plugin's own origin.
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.addClass('clew-figure-sandbox');
    iframe.src = SANDBOX_URL;
    this.iframe = iframe;
    let timer: number | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('start-up timed out')), LIMITS.startMs);
    });
    try {
      await Promise.race([this.handshake(iframe), deadline]);
      if (this.iframe === iframe) this.ready = true;
    } catch {
      if (this.iframe === iframe) this.reset(COULD_NOT_RUN);
    } finally {
      window.clearTimeout(timer);
    }
  }

  private async handshake(iframe: HTMLIFrameElement): Promise<void> {
    const loaded = new Promise<void>((resolve) => iframe.addEventListener('load', () => resolve(), { once: true }));
    document.body.appendChild(iframe);
    await loaded;
    const ready = new Promise<void>((resolve) => {
      this.onReady = resolve;
    });
    iframe.contentWindow?.postMessage({ type: 'source', source: WORKER_SOURCE }, '*');
    await ready;
    // The probe is the sandbox's own code; a busy start-up gets the start-up deadline, not a program's.
    const payload = await new Promise<unknown>((reply, fail) => this.post({ kind: 'probe' }, { reply, fail }, LIMITS.startMs));
    if (this.iframe !== iframe) return;
    this.disabled = probeProblem(payload);
    if (this.disabled) console.warn(`Clew: ${this.disabled}`);
  }

  private post(request: unknown, posted: Posted, ms: number = LIMITS.runMs): void {
    const id = (this.nextId += 1);
    this.posted.set(id, posted);
    this.iframe?.contentWindow?.postMessage({ type: 'run', id, request, ms }, '*');
  }

  private pump(): void {
    if (this.disabled) {
      for (const entry of this.queue.splice(0)) entry.settle({ ok: false, error: this.disabled, repairable: false });
      return;
    }
    if (!this.ready) return;
    while (this.posted.size < LIMITS.workers && this.queue.length) {
      let nearest = 0;
      for (let i = 1; i < this.queue.length; i += 1) if (this.queue[i].near() < this.queue[nearest].near()) nearest = i;
      this.dispatch(this.queue.splice(nearest, 1)[0]);
    }
  }

  private dispatch(entry: Queued): void {
    // The iframe answers every run by its own deadline; silence means it is dead.
    const timer = window.setTimeout(() => {
      this.reset(COULD_NOT_RUN);
      this.warm();
    }, LIMITS.replyWaitMs);
    this.post({ kind: 'run', source: entry.source, params: entry.params }, {
      reply: (payload) => {
        window.clearTimeout(timer);
        entry.settle(readPayload(payload));
        this.pump();
      },
      fail: (error) => {
        window.clearTimeout(timer);
        this.retryOrFail(entry, error);
      },
    });
  }

  private reset(error: string): void {
    this.iframe?.remove();
    this.iframe = undefined;
    this.starting = undefined;
    this.ready = false;
    this.onReady = undefined;
    const posted = [...this.posted.values()];
    const queued = this.queue.splice(0);
    this.posted.clear();
    for (const entry of posted) entry.fail(error);
    for (const entry of queued) this.retryOrFail(entry, error);
  }

  /** A run lost to a dead or slow sandbox, not to its program, gets one more try on a new one; `destroy` fails it. */
  private retryOrFail(entry: Queued, error: string): void {
    if (entry.retried || !this.listening) {
      entry.settle({ ok: false, error, repairable: false });
      return;
    }
    entry.retried = true;
    this.queue.push(entry);
    void this.start().then(() => this.pump());
  }
}

/** A run's reply as a result; an error envelope is checked before any of it is shown. */
function readPayload(payload: unknown): RunResult {
  if (!isObject(payload) || !Object.hasOwn(payload, 'error')) return { ok: true, payload };
  const error = own(payload, 'error');
  const message = isObject(error) ? own(error, 'message') : undefined;
  if (typeof message !== 'string') return { ok: false, error: 'The figure returned a malformed error', repairable: true };
  const line = own(error as Plain, 'line');
  return { ok: false, error: message.slice(0, LIMITS.string), ...(Number.isInteger(line) && (line as number) > 0 ? { line: line as number } : {}), repairable: true };
}

/** Why figures must not run here, from what the probe saw inside a sandbox worker; undefined when it is safe. */
function probeProblem(payload: unknown): string | undefined {
  if (!isObject(payload) || Object.hasOwn(payload, 'error')) return BLOCKED;
  if (own(payload, 'require') !== 'undefined' || own(payload, 'process') !== 'undefined' || own(payload, 'fetchBlocked') !== true) return NOT_ISOLATED;
  return own(payload, 'importWorks') === true ? undefined : BLOCKED;
}

export const figureSandbox = new FigureSandbox();
