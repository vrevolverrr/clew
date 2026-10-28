import { setIcon } from '@/shared/view/icon';

export function createIconButton(parent: HTMLElement, icon: string, label: string, cls = ''): HTMLElement {
  const button = parent.createEl('button', { cls: `clew-icon-action clickable-icon ${cls}`.trim(), attr: { 'aria-label': label } });
  setIcon(button, icon);
  return button;
}

/** An icon button that copies the text it is given and shows a check for a moment. */
export function createCopyButton(parent: HTMLElement, label: string, text: () => string, cls = ''): HTMLElement {
  const button = createIconButton(parent, 'copy', label, cls);
  let reset: number | undefined;
  button.addEventListener('click', () => {
    void navigator.clipboard.writeText(text()).then(() => {
      setIcon(button, 'check');
      button.addClass('is-copied');
      window.clearTimeout(reset);
      reset = window.setTimeout(() => {
        setIcon(button, 'copy');
        button.removeClass('is-copied');
      }, 1500);
    });
  });
  return button;
}

/** Whether to play an element animation: the API exists and the reader has not asked for less motion. */
export function canAnimate(el: HTMLElement): boolean {
  return typeof el.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
