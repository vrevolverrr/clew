const CLOSE_MS = 120;
let anchors = 0;

/**
 * An id on the button a menu opens from, so the menu can be named by it. An aria-label on the menu itself
 * would make Obsidian pop up a tooltip over the menu's options.
 */
export function menuLabelId(anchor: HTMLElement): string {
  anchor.id ||= `clew-menu-anchor-${anchors++}`;
  return anchor.id;
}

/** Calls `close` on a press outside the menu and its anchor, and on Escape, which also returns focus to the anchor. Returns the function that stops listening. */
export function dismissOnOutside(anchor: HTMLElement, menu: HTMLElement, close: () => void): () => void {
  const doc = anchor.ownerDocument;
  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!menu.contains(target) && !anchor.contains(target)) close();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
    anchor.focus();
  };
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('keydown', onKeyDown, true);
  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('keydown', onKeyDown, true);
  };
}

/** Plays the closing animation (`.is-closing` in `styles.css`), then removes the menu. */
export function removeMenu(menu: HTMLElement): void {
  menu.addClass('is-closing');
  window.setTimeout(() => menu.remove(), CLOSE_MS);
}
