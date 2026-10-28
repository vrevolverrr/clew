import { Component, finishRenderMath, MarkdownRenderer } from 'obsidian';
import type { App } from 'obsidian';

import { escapeRawHTMLTags } from '@/renderer/markdown/markdownHTML';
import { normalizeLatexMathDelimiters } from '@/renderer/markdown/markdownMath';
import { prepareDisplayOnlyCodeFences, restoreDisplayOnlyCodeFences } from '@/renderer/markdown/obsidian/DisplayOnlyCodeFences';
import { prepareDisplayOnlyInlineCode, restoreDisplayOnlyInlineCode } from '@/renderer/markdown/obsidian/DisplayOnlyInlineCode';
import { replaceImageEmbedsWithHTML } from '@/renderer/markdown/obsidian/imageEmbed';

/** One Markdown render, including registrations that arrive after it was replaced. */
class MarkdownRenderScope extends Component {
  isReleased = false;

  override unload(): void {
    if (this.isReleased) return;
    this.isReleased = true;
    super.unload();
  }

  override register(callback: () => void): void {
    if (this.isReleased) callback();
    else super.register(callback);
  }

  override addChild<T extends Component>(child: T): T {
    if (!this.isReleased) return super.addChild(child);
    // Native Component.unload() does nothing until load(). Late embed owners
    // still need their registered resources released, even after our unload.
    try {
      child.load();
    } finally {
      child.unload();
    }
    return child;
  }
}

/** Work on a finished render, such as drawing its diagrams: it stops once `isCurrent` is false, and frees what it made through `scope`. */
export type AfterRender = (el: HTMLElement, isCurrent: () => boolean, scope: Component) => Promise<void>;

/**
 * Renders chat Markdown into elements and owns each element's
 * render scope until it is replaced, released, or the renderer is disposed.
 */
export class MarkdownContentRenderer {
  readonly #renders = new Map<HTMLElement, MarkdownRenderScope>();
  #isDisposed = false;

  constructor(
    private readonly app: App,
    private readonly component: Component,
    /** The note that links and image embeds resolve against. */
    private readonly getSourcePath: () => string,
  ) {}

  /** Renders Markdown into `el`, replacing any earlier render of it, then runs `after` on the result. */
  async render(
    el: HTMLElement,
    markdown: string,
    after?: AfterRender,
  ): Promise<void> {
    if (this.#isDisposed) return;
    this.#releaseOne(el);
    const scope = new MarkdownRenderScope();
    this.#renders.set(el, scope);
    scope.register(() => {
      if (this.#renders.get(el) === scope) this.#renders.delete(el);
    });
    this.component.addChild(scope);
    scope.load();
    const isCurrent = () => !this.#isDisposed && !scope.isReleased
      && this.#renders.get(el) === scope;
    el.empty();

    try {
      const normalizedMarkdown = normalizeLatexMathDelimiters(markdown);
      // Escape user-authored HTML first so placeholders like <meta-name> render
      // as plain text. Trusted plugin markup (image embeds) is injected only
      // after this step, otherwise it would be escaped too.
      const safeMarkdown = escapeRawHTMLTags(normalizedMarkdown);
      // Model output must never reach a code processor such as dataviewjs or inline `$=`.
      const displayOnlyCodeFences = prepareDisplayOnlyCodeFences(safeMarkdown);
      const displayOnlyInlineCode = prepareDisplayOnlyInlineCode(displayOnlyCodeFences.markdown);
      const sourcePath = this.getSourcePath();
      const processedMarkdown = replaceImageEmbedsWithHTML(displayOnlyInlineCode.markdown, this.app, sourcePath);
      await MarkdownRenderer.render(this.app, processedMarkdown, el, sourcePath, scope);
      // MathJax styles each glyph the first time it is used, and those styles apply only once flushed.
      if (el.querySelector('mjx-container')) await finishRenderMath();
      if (!isCurrent()) return;
      restoreDisplayOnlyInlineCode(el, displayOnlyInlineCode.spans);
      await restoreDisplayOnlyCodeFences(el, displayOnlyCodeFences.fences);

      if (!isCurrent()) return;
      for (const table of el.querySelectorAll('table')) {
        if (table.parentElement?.classList.contains('table-wrapper')) continue;
        const scroll = document.createElement('div');
        scroll.className = 'table-wrapper';
        table.before(scroll);
        scroll.appendChild(table);
      }
      // After the code fences are restored, so `after` sees each block's own language.
      if (after) await after(el, isCurrent, scope);
    } catch {
      if (!isCurrent()) return;
      this.#releaseOne(el);
      el.createDiv({
        cls: 'clew-render-error',
        text: 'Could not render this message.',
      });
    }
  }

  /** Releases renders at or inside `container`, or every render when omitted. */
  release(container?: HTMLElement): void {
    for (const el of this.#renders.keys()) {
      if (!container || container === el || container.contains(el)) {
        this.#releaseOne(el);
      }
    }
  }

  dispose(): void {
    this.#isDisposed = true;
    this.release();
  }

  #releaseOne(el: HTMLElement): void {
    const scope = this.#renders.get(el);
    if (!scope) return;
    this.#renders.delete(el);
    this.component.removeChild(scope);
  }
}
