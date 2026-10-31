import vm from 'node:vm';

/**
 * Runs the figure worker's source on one request in a fresh `node:vm` context and resolves with its first message, as
 * a structured clone in this realm. Node cannot read a blob synchronously, so the context gets its own `Blob`, blob URLs
 * and `importScripts`, and a program loads the way the worker loads it in the sandbox, with its URL in stack frames.
 */
export function runFigureWorker(workerSource: string, request: unknown, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const blobs = new Map<string, string>();
    let next = 0;
    class Blob {
      constructor(readonly parts: string[]) {}
    }
    const context: Record<string, unknown> = {
      Blob,
      URL: {
        createObjectURL: (blob: Blob) => {
          const url = `blob:test/${(next += 1)}`;
          blobs.set(url, blob.parts.join(''));
          return url;
        },
        revokeObjectURL: (url: string) => blobs.delete(url),
      },
      importScripts: (url: string) => {
        const text = blobs.get(url);
        if (text === undefined) throw new Error(`importScripts: no blob at ${url}`);
        vm.runInContext(text, context, { filename: url, timeout: timeoutMs });
      },
      postMessage: (message: unknown) => resolve(inThisRealm(structuredClone(message))),
      __request: request,
    };
    context.self = context;
    vm.createContext(context);
    try {
      vm.runInContext(workerSource, context, { timeout: timeoutMs });
      vm.runInContext('self.onmessage({ data: __request })', context, { timeout: timeoutMs });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** The clone's arrays and objects rebuilt here: Jest's `structuredClone` returns them from Node's own realm. */
function inThisRealm(value: unknown): unknown {
  if (Array.isArray(value)) return Array.from(value, inThisRealm);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.keys(value).map((key) => [key, inThisRealm((value as Record<string, unknown>)[key])]));
}
