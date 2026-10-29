// DOM helpers that Obsidian adds to HTMLElement at runtime; only suites that run under jsdom have an HTMLElement to extend.
type Options = { cls?: string; text?: string; attr?: Record<string, string> };
type Made = HTMLElement & { createEl: (tag: string, options?: Options) => HTMLElement };

if (typeof HTMLElement !== 'undefined') {
  // Obsidian's global createEl makes a detached element.
  Object.assign(globalThis, {
    createEl(tag: string, options: Options = {}) {
      const el = document.createElement(tag);
      el.className = options.cls ?? '';
      el.textContent = options.text ?? '';
      for (const [name, value] of Object.entries(options.attr ?? {})) el.setAttribute(name, value);
      return el;
    },
  });
  Object.assign(HTMLElement.prototype, {
    createEl(this: HTMLElement, tag: string, options: Options = {}) {
      const el = this.appendChild(document.createElement(tag));
      el.className = options.cls ?? '';
      el.textContent = options.text ?? '';
      for (const [name, value] of Object.entries(options.attr ?? {})) el.setAttribute(name, value);
      return el;
    },
    createDiv(this: Made, options?: Options) {
      return this.createEl('div', options);
    },
    createSpan(this: Made, options?: Options) {
      return this.createEl('span', options);
    },
    appendText(this: HTMLElement, text: string) {
      this.appendChild(document.createTextNode(text));
    },
    empty(this: HTMLElement) {
      this.replaceChildren();
    },
    setText(this: HTMLElement, text: string) {
      this.textContent = text;
    },
    setAttr(this: HTMLElement, name: string, value: string) {
      this.setAttribute(name, value);
    },
    hasClass(this: HTMLElement, cls: string) {
      return this.classList.contains(cls);
    },
    toggleClass(this: HTMLElement, cls: string, value: boolean) {
      this.classList.toggle(cls, value);
    },
    addClass(this: HTMLElement, cls: string) {
      this.classList.add(cls);
    },
    removeClass(this: HTMLElement, cls: string) {
      this.classList.remove(cls);
    },
  });
}
