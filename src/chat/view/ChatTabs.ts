import type { AgentId } from '@/agents/types';
import { canAnimate } from '@/shared/view/iconButtons';

export interface ChatTab {
  id: string;
  title: string;
  agent: AgentId;
  running: boolean;
  unread: boolean;
  failed: boolean;
  waitingForApproval?: boolean;
}

export function chatTabStatus(tab: ChatTab): string {
  return tab.waitingForApproval ? 'Needs approval' : tab.running ? 'Generating' : tab.failed ? 'Failed' : tab.unread ? 'Unread reply' : '';
}

export interface ChatTabsHost {
  create(): void;
  select(id: string): void;
  close(id: string): void;
}

/** Numbered navigation; the same ordered tabs supply the history menu's named list. */
export class ChatTabs {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private readonly resize: ResizeObserver;
  private readonly animations = new Map<HTMLElement, Animation>();
  private selected: string | undefined;

  constructor(parent: HTMLElement, private readonly host: ChatTabsHost) {
    this.el = parent.createDiv({ cls: 'clew-chat-tabs' });
    this.list = this.el.createDiv({ cls: 'clew-chat-tab-list', attr: { role: 'tablist', 'aria-label': 'Open chats' } });
    const create = this.el.createEl('button', { cls: 'clew-chat-tab clew-chat-tab-add', text: '+', attr: { type: 'button', 'aria-label': 'New tab' } });
    create.addEventListener('click', () => this.host.create());
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(parent);
  }

  set(tabs: readonly ChatTab[], selected: string | undefined): void {
    const animate = this.selected !== undefined && canAnimate(this.el);
    const added: HTMLButtonElement[] = [];
    this.selected = selected;
    let restoreFocus = false;
    for (const [id, button] of this.buttons) {
      if (tabs.some((tab) => tab.id === id)) continue;
      restoreFocus ||= button === button.ownerDocument.activeElement;
      button.disabled = true;
      button.inert = true;
      button.tabIndex = -1;
      button.removeAttribute('role');
      button.setAttribute('aria-hidden', 'true');
      this.animateTab(button, false, animate);
      this.buttons.delete(id);
    }
    let slot = this.list.firstElementChild;
    tabs.forEach((tab, index) => {
      let button = this.buttons.get(tab.id);
      if (!button) {
        button = this.list.createEl('button', { cls: 'clew-chat-tab', attr: { type: 'button', role: 'tab' } });
        const target = button;
        target.createSpan({ cls: 'clew-chat-tab-number' });
        target.createSpan({ cls: 'clew-chat-tab-status', attr: { 'aria-hidden': 'true' } });
        target.createSpan({ cls: 'clew-chat-tab-title', attr: { 'aria-hidden': 'true' } });
        target.addEventListener('pointerenter', () => this.positionTitle(target));
        target.addEventListener('focus', () => this.positionTitle(target));
        target.addEventListener('click', () => this.host.select(tab.id));
        target.addEventListener('auxclick', (event) => {
          if (event.button === 1) { event.preventDefault(); this.host.close(tab.id); }
        });
        target.addEventListener('contextmenu', (event) => { event.preventDefault(); this.host.close(tab.id); });
        target.addEventListener('keydown', (event) => {
          const items = [...this.buttons.values()].filter((button) => !button.hidden);
          const position = items.indexOf(target);
          let next: HTMLButtonElement | undefined;
          if (event.key === 'ArrowRight') next = items[(position + 1) % items.length];
          else if (event.key === 'ArrowLeft') next = items[(position + items.length - 1) % items.length];
          else if (event.key === 'Home') next = items[0];
          else if (event.key === 'End') next = items.at(-1);
          else if (event.key === 'Delete') {
            event.preventDefault();
            this.host.close(tab.id);
            return;
          }
          if (next) { event.preventDefault(); next.focus(); next.click(); }
        });
        this.buttons.set(tab.id, target);
        added.push(target);
      }
      while (slot?.classList.contains('is-leaving')) slot = slot.nextElementSibling;
      if (slot === button) slot = slot.nextElementSibling;
      else this.list.insertBefore(button, slot);
      const title = tab.title || 'New chat';
      const status = chatTabStatus(tab);
      button.id = `clew-tab-${tab.id}`;
      button.setAttribute('aria-controls', `clew-panel-${tab.id}`);
      button.setAttribute('aria-selected', String(tab.id === selected));
      button.setAttribute('aria-label', `${index + 1}: ${title}${status ? `, ${status}` : ''}`);
      button.tabIndex = tab.id === selected ? 0 : -1;
      button.toggleClass('is-running', tab.running);
      button.toggleClass('is-unread', tab.unread);
      button.toggleClass('is-failed', tab.failed);
      button.toggleClass('needs-approval', !!tab.waitingForApproval);
      button.querySelector('.clew-chat-tab-number')!.textContent = String(index + 1);
      button.querySelector('.clew-chat-tab-title')!.textContent = title;
    });
    this.buttons = new Map(tabs.map((tab) => [tab.id, this.buttons.get(tab.id)!]));
    this.fit();
    for (const button of added) this.animateTab(button, true, animate);
    if (restoreFocus && selected) this.buttons.get(selected)?.focus();
  }

  private fit(): void {
    const items = [...this.buttons.entries()];
    const bar = this.el.parentElement!;
    const leaving = this.list.querySelectorAll('.is-leaving').length;
    // Each numbered button takes 28 px plus a 4 px gap; the trailing + takes 28 px.
    const capacity = bar.clientWidth ? Math.max(1, Math.floor((bar.clientWidth - 28) / 32) - leaving) : items.length;
    const visible = items.slice(0, capacity).map(([id]) => id);
    if (this.selected && !visible.includes(this.selected)) visible[visible.length - 1] = this.selected;
    for (const [id, button] of items) button.hidden = !visible.includes(id);
  }

  private animateTab(button: HTMLButtonElement, entering: boolean, animate: boolean): void {
    const playing = animate && !button.hidden;
    const style = !entering && playing ? button.ownerDocument.defaultView!.getComputedStyle(button) : undefined;
    const current = style && { width: style.width, marginInlineEnd: style.marginInlineEnd, opacity: style.opacity, transform: style.transform };
    this.animations.get(button)?.cancel();
    this.animations.delete(button);
    button.removeClass('is-entering');
    if (!playing) {
      if (!entering) button.remove();
      return;
    }
    const open = { width: '28px', marginInlineEnd: '4px', opacity: 1, transform: 'none' };
    const shut = { width: '0px', marginInlineEnd: '0px', opacity: 0, transform: 'scale(0.85)' };
    button.addClass(entering ? 'is-entering' : 'is-leaving');
    const animation = button.animate(entering ? [shut, open] : [current!, shut], { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
    this.animations.set(button, animation);
    const finish = (): void => {
      if (this.animations.get(button) !== animation) return;
      this.animations.delete(button);
      if (entering) button.removeClass('is-entering');
      else button.remove();
      animation.cancel();
      this.fit();
    };
    void animation.finished.then(finish, finish);
  }

  private positionTitle(button: HTMLButtonElement): void {
    const title = button.querySelector<HTMLElement>('.clew-chat-tab-title')!;
    const header = this.el.parentElement!.getBoundingClientRect();
    const anchor = button.getBoundingClientRect();
    title.style.maxWidth = `${Math.min(280, header.width)}px`;
    title.style.left = `${Math.max(header.left, Math.min(anchor.left, header.right - title.offsetWidth))}px`;
    title.style.top = `${anchor.bottom + 4}px`;
  }

  destroy(): void {
    this.resize.disconnect();
    for (const [button, animation] of this.animations) {
      if (button.classList.contains('is-leaving')) button.remove();
      button.removeClass('is-entering');
      animation.cancel();
    }
    this.animations.clear();
  }
}
