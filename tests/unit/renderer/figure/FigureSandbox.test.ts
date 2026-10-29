/** @jest-environment jsdom */
import { LIMITS } from '@/renderer/figure/FigureData';
import { FigureSandbox, type RunResult } from '@/renderer/figure/FigureSandbox';
import { SANDBOX_URL } from '@/renderer/figure/sandboxSource';

type Posted = { type: string; id: number; request: { kind: string; source?: string } };

const SAFE_PROBE = { require: 'undefined', process: 'undefined', importWorks: true, fetchBlocked: true };
const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(0);

/** Drives the iframe's side of the protocol: jsdom does not load the `data:` document. */
function frame(): { iframe: HTMLIFrameElement; posts: Posted[]; say(data: unknown, source?: Window): void } {
  const iframe = document.querySelector('iframe')!;
  const posts: Posted[] = [];
  iframe.contentWindow!.postMessage = ((message: Posted) => posts.push(message)) as Window['postMessage'];
  return {
    iframe,
    posts,
    say: (data, source = iframe.contentWindow!) => window.dispatchEvent(new MessageEvent('message', { source, data })),
  };
}

async function started(sandbox: FigureSandbox, probe: unknown = SAFE_PROBE): Promise<ReturnType<typeof frame>> {
  sandbox.warm();
  const side = frame();
  side.iframe.dispatchEvent(new Event('load'));
  await flush();
  side.say({ type: 'ready' });
  await flush();
  const asked = side.posts.find((post) => post.request?.kind === 'probe')!;
  side.say({ type: 'result', id: asked.id, payload: probe });
  await flush();
  return side;
}

const runs = (side: ReturnType<typeof frame>): Posted[] => side.posts.filter((post) => post.request?.kind === 'run');

let sandbox: FigureSandbox;

beforeEach(() => {
  jest.useFakeTimers();
  sandbox = new FigureSandbox();
});

afterEach(() => {
  sandbox.destroy();
  jest.useRealTimers();
});

describe('FigureSandbox', () => {
  it('starts one hidden iframe with only allow-scripts, from the data: document with the exact policy', async () => {
    await started(sandbox);
    const iframes = document.querySelectorAll('iframe');
    expect(iframes).toHaveLength(1);
    expect(iframes[0].getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframes[0].src).toBe(SANDBOX_URL);
    expect(decodeURIComponent(SANDBOX_URL)).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'">`);
  });

  it('runs a program and hands back the payload untouched', async () => {
    const side = await started(sandbox);
    const result = sandbox.run('export default () => 1', { n: 2 }, () => 0);
    await flush();
    const [post] = runs(side);
    expect(post.request).toEqual({ kind: 'run', source: 'export default () => 1', params: { n: 2 } });
    side.say({ type: 'result', id: post.id, payload: { frames: [] } });
    await expect(result).resolves.toEqual({ ok: true, payload: { frames: [] } });
  });

  it.each([['no load', false], ['no ready', true]])('fails pending runs when start-up gets %s in time', async (_, load) => {
    sandbox.warm();
    const side = frame();
    if (load) side.iframe.dispatchEvent(new Event('load'));
    const result = sandbox.run('x', {}, () => 0);
    await jest.advanceTimersByTimeAsync(LIMITS.startMs);
    await expect(result).resolves.toEqual({ ok: false, error: 'The figure could not run', repairable: false });
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('reads an error envelope, and calls a malformed one repairable', async () => {
    const side = await started(sandbox);
    const results = [sandbox.run('a', {}, () => 0), sandbox.run('b', {}, () => 0), sandbox.run('c', {}, () => 0)];
    await flush();
    const [a, b, c] = runs(side);
    side.say({ type: 'result', id: a.id, payload: { error: { message: 'Step 2: TypeError: x', line: 7 } } });
    side.say({ type: 'result', id: b.id, payload: { error: { message: 1 } } });
    side.say({ type: 'result', id: c.id, payload: { error: 'x' } });
    expect(await Promise.all(results)).toEqual([
      { ok: false, error: 'Step 2: TypeError: x', line: 7, repairable: true },
      { ok: false, error: 'The figure returned a malformed error', repairable: true },
      { ok: false, error: 'The figure returned a malformed error', repairable: true },
    ]);
  });

  it('never posts an aborted queued run', async () => {
    const controller = new AbortController();
    sandbox.warm();
    const side = frame();
    const result = sandbox.run('x', {}, () => 0, controller.signal);
    controller.abort();
    await expect(result).resolves.toMatchObject({ ok: false, repairable: false });
    side.iframe.dispatchEvent(new Event('load'));
    await flush();
    side.say({ type: 'ready' });
    await flush();
    side.say({ type: 'result', id: side.posts.find((post) => post.request?.kind === 'probe')!.id, payload: SAFE_PROBE });
    await flush();
    expect(runs(side)).toHaveLength(0);
  });

  it('ignores a reply from another window and a second reply for the same id', async () => {
    const side = await started(sandbox);
    const result = sandbox.run('x', {}, () => 0);
    await flush();
    const [post] = runs(side);
    side.say({ type: 'result', id: post.id, payload: 'forged' }, window);
    side.say({ type: 'result', id: post.id, payload: 'first' });
    side.say({ type: 'result', id: post.id, payload: 'second' });
    await expect(result).resolves.toEqual({ ok: true, payload: 'first' });
  });

  it('runs four at once, and the queued run nearest the viewport goes next', async () => {
    const side = await started(sandbox);
    const results: Promise<RunResult>[] = [];
    for (const [source, near] of [['a', 0], ['b', 0], ['c', 0], ['d', 0], ['far', 900], ['near', 10]] as const) results.push(sandbox.run(source, {}, () => near));
    await flush();
    expect(runs(side).map((post) => post.request.source)).toEqual(['a', 'b', 'c', 'd']);
    side.say({ type: 'result', id: runs(side)[0].id, payload: 1 });
    await flush();
    expect(runs(side).map((post) => post.request.source)).toEqual(['a', 'b', 'c', 'd', 'near']);
  });

  it('recreates a silent iframe and fails what was pending', async () => {
    const side = await started(sandbox);
    const result = sandbox.run('x', {}, () => 0);
    await flush();
    await jest.advanceTimersByTimeAsync(LIMITS.replyWaitMs);
    await expect(result).resolves.toEqual({ ok: false, error: 'The figure could not run', repairable: false });
    const iframes = document.querySelectorAll('iframe');
    expect(iframes).toHaveLength(1);
    expect(iframes[0]).not.toBe(side.iframe);
  });

  it.each([
    [{ ...SAFE_PROBE, require: 'function' }, 'Figures are disabled: the sandbox is not isolated in this Obsidian build'],
    [{ ...SAFE_PROBE, fetchBlocked: false }, 'Figures are disabled: the sandbox is not isolated in this Obsidian build'],
    [{ ...SAFE_PROBE, importWorks: false }, 'Figures are disabled: this Obsidian build blocks running them'],
  ])('disables runs after a failed probe', async (probe, error) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const side = await started(sandbox, probe);
    await expect(sandbox.run('x', {}, () => 0)).resolves.toEqual({ ok: false, error, repairable: false });
    expect(runs(side)).toHaveLength(0);
    warn.mockRestore();
  });

  it('refuses a source over 64 KiB without posting it', async () => {
    const side = await started(sandbox);
    await expect(sandbox.run('x'.repeat(LIMITS.source + 1), {}, () => 0)).resolves.toEqual({ ok: false, error: 'The figure program is over 64 KiB', repairable: true });
    expect(runs(side)).toHaveLength(0);
  });

  it('removes the iframe on destroy and starts a new one on the next run', async () => {
    await started(sandbox);
    sandbox.destroy();
    expect(document.querySelector('iframe')).toBeNull();
    void sandbox.run('x', {}, () => 0);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
  });
});
