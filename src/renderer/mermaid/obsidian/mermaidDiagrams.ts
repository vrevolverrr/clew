import type { App, Component } from 'obsidian';
import { loadMathJax, Modal } from 'obsidian';
import type * as Pele from 'pele';

import { canAnimate, createCopyButton, createIconButton } from '@/shared/view/iconButtons';

import { diagramMath } from './diagramMath';

type PeleWindow = Window & { pele?: typeof Pele };

let pele: Promise<typeof Pele | undefined> | undefined;

/**
 * Obsidian ships Pele as a script with every diagram type, but no API loads it yet, so load the script itself.
 * An Obsidian without it leaves diagrams as code.
 */
function loadPele(): Promise<typeof Pele | undefined> {
  pele ??= new Promise((resolve) => {
    const existing = (window as PeleWindow).pele;
    if (existing) return resolve(existing);
    const script = createEl('script');
    script.src = '/lib/pele.min.js';
    script.onload = () => resolve((window as PeleWindow).pele);
    script.onerror = () => {
      script.remove();
      resolve(undefined);
    };
    document.head.append(script);
  });
  return pele;
}

// Images and links would let model output fetch a URL or navigate the window.
const SAFE = { images: false, links: false, math: diagramMath } as const;

/**
 * Replaces each rendered ```` ```mermaid ```` code block in `el` with its diagram, drawn by Pele, which emits
 * no scripts or event handlers. A block that fails to draw stays as code.
 */
export async function renderMermaidDiagrams(
  app: App,
  el: HTMLElement,
  isCurrent: () => boolean,
  scope: Component,
): Promise<void> {
  const codes = Array.from(el.querySelectorAll<HTMLElement>('pre > code.language-mermaid'));
  if (!codes.length) return;
  const loaded = await loadPele();
  if (!loaded || !isCurrent()) return;
  // The resolver draws maths synchronously, which Obsidian allows once its maths engine has loaded.
  if (codes.some((code) => code.textContent?.includes('$$'))) {
    await loadMathJax();
    if (!isCurrent()) return;
  }
  for (const code of codes) {
    const pre = code.parentElement!;
    const source = code.textContent ?? '';
    const figure = createDiv();
    pre.before(figure);
    const header = figure.createDiv({ cls: 'clew-mermaid-header' });
    const diagram = loaded.mount(figure.createDiv({ cls: 'clew-mermaid' }), source, { ...SAFE, zoom: false });
    if (!diagram.result) {
      diagram.destroy();
      figure.remove();
      continue;
    }
    pre.remove();
    scope.register(() => diagram.destroy());
    const title = titleOf(diagram.result.type);
    header.createSpan({ cls: 'clew-mermaid-title', text: title });
    createCopyButton(header, 'Copy diagram source', () => source);
    createIconButton(header, 'maximize-2', 'Expand diagram')
      .addEventListener('click', () => new DiagramModal(app, loaded, source, title, figure).open());
  }
}

const TITLES: Record<string, string> = { er: 'Entity relationship', git: 'Git graph', xychart: 'XY chart', c4: 'C4', treeView: 'Tree view' };

function titleOf(type: string): string {
  return TITLES[type] ?? type.charAt(0).toUpperCase() + type.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

const CLOSE_MS = 200;

/** The diagram filling most of the window, to pan and zoom around a large one. It grows out of its card and back. */
class DiagramModal extends Modal {
  private diagram: Pele.Mounted | null = null;
  private closing = false;

  constructor(
    app: App,
    private readonly pele: typeof Pele,
    private readonly source: string,
    private readonly title: string,
    private readonly origin: HTMLElement,
  ) {
    super(app);
  }

  override open(): void {
    super.open();
    this.morph(false);
  }

  override close(): void {
    if (this.closing) return;
    this.closing = true;
    if (this.morph(true)) window.setTimeout(() => super.close(), CLOSE_MS);
    else super.close();
  }

  /** Animates between the card's box and the modal's, with the backdrop fading alongside. */
  private morph(back: boolean): boolean {
    if (!canAnimate(this.modalEl)) return false;
    const from = this.origin.getBoundingClientRect();
    const to = this.modalEl.getBoundingClientRect();
    if (!from.width || !to.width || !this.origin.isConnected) return false;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const card = { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width})`, opacity: 0 };
    const open = { transform: 'none', opacity: 1 };
    // Only the way back holds its last frame, until the modal is removed.
    const timing: KeyframeAnimationOptions = back
      ? { duration: CLOSE_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
      : { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' };
    const backdrop = this.containerEl.querySelector<HTMLElement>('.modal-bg');
    const dim = backdrop && getComputedStyle(backdrop).opacity;
    backdrop?.animate([{ opacity: 0 }, { opacity: dim }], { ...timing, direction: back ? 'reverse' : 'normal' });
    this.modalEl.animate(back ? [open, card] : [card, open], timing);
    return true;
  }

  override onOpen(): void {
    this.modalEl.addClass('clew-diagram-modal');
    this.titleEl.setText(this.title);
    const container = this.contentEl.createDiv({ cls: 'clew-mermaid' });
    // Pele zooms on a modified wheel only, so a page can scroll; nothing scrolls here, so a plain wheel zooms too.
    container.addEventListener('wheel', (event) => {
      if (event.ctrlKey || event.metaKey || !this.diagram?.zoom) return;
      event.preventDefault();
      this.diagram.zoom.zoomBy(2 ** (Math.min(Math.max(-event.deltaY, -24), 24) * 0.02));
    }, { passive: false });
    this.diagram = this.pele.mount(container, this.source, {
      ...SAFE,
      zoom: { always: true, maxScale: 6 },
      onRender: ({ width, height }) => container.style.setProperty('--clew-diagram-ratio', String(width / height)),
    });
  }

  override onClose(): void {
    this.diagram?.destroy();
    this.contentEl.empty();
  }
}
