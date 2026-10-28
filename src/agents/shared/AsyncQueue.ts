/** A push-based async iterable: a Claude prompt stream, or the events of one Codex turn. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private pending: T[] = [];
  private waiting: ((result: IteratorResult<T>) => void) | null = null;
  private closed = false;

  push(item: T): void {
    if (this.closed) throw new Error('AsyncQueue is closed');
    const waiting = this.waiting;
    this.waiting = null;
    if (waiting) waiting({ value: item, done: false });
    else this.pending.push(item);
  }

  close(): void {
    this.closed = true;
    this.waiting?.({ value: undefined, done: true });
    this.waiting = null;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.pending.length > 0) return Promise.resolve({ value: this.pending.shift()!, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => { this.waiting = resolve; });
      },
    };
  }
}
