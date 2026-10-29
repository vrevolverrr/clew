/** The current caption over an invisible stack of every caption, so wrapping and resizing keep the tallest one's height. */
export class CaptionStack {
  readonly el = createDiv();
  private readonly live = createDiv();
  private readonly sizes = createDiv();
  private captions: readonly string[] = [];
  private shown = '';

  constructor(private readonly render: (el: HTMLElement, text: string) => void) {
    this.el.className = 'clew-captions';
    this.live.className = 'clew-caption';
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('aria-atomic', 'true');
    this.sizes.className = 'clew-caption-sizes';
    this.sizes.setAttribute('aria-hidden', 'true');
    this.el.append(this.live, this.sizes);
  }

  /** Every caption the block may show. Empty ones take no space; with none, the block hides. */
  set(captions: readonly string[]): void {
    if (captions.length === this.captions.length && captions.every((text, i) => text === this.captions[i])) return;
    this.captions = captions;
    this.sizes.replaceChildren(...captions.filter(Boolean).map((text) => {
      const size = createDiv();
      size.className = 'clew-caption';
      this.render(size, text);
      return size;
    }));
    this.el.hidden = !captions.some(Boolean);
  }

  show(text: string): void {
    if (text === this.shown) return;
    this.shown = text;
    if (text) this.render(this.live, text);
    else this.live.replaceChildren();
  }
}
