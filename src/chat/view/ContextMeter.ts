export interface ContextMeter {
  set(used: number, window: number): void;
  clear(): void;
}

const HIGH = 0.8;

function formatTokens(count: number): string {
  return count >= 1000 ? `${Math.round(count / 1000)}k` : String(count);
}

/** A ring in the composer bar showing how much of the model's context window the conversation fills; hidden until a turn reports it. */
export function contextMeter(parent: HTMLElement): ContextMeter {
  const ring = parent.createDiv({ cls: 'clew-context-meter is-empty' });
  return {
    set(used, window) {
      const share = Math.min(used / window, 1);
      ring.style.setProperty('--clew-context-share', `${share * 100}%`);
      ring.dataset.high = String(share >= HIGH);
      ring.setAttr('aria-label', `Context ${Math.round(share * 100)}%: ${formatTokens(used)} / ${formatTokens(window)} tokens`);
      ring.toggleClass('is-empty', false);
    },
    clear() {
      ring.toggleClass('is-empty', true);
    },
  };
}
