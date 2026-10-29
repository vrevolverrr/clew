const NS = 'http://www.w3.org/2000/svg';

/** Creates an SVG element with attributes, optionally under `parent` and holding `text`. */
export function svg(tag: string, attrs: Record<string, string | number | undefined>, parent?: Element, text?: string): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) if (value !== undefined) el.setAttribute(name, String(value));
  parent?.appendChild(el);
  if (text !== undefined) el.textContent = text;
  return el;
}

export function div(className: string, role?: string): HTMLElement {
  const el = createDiv();
  el.className = className;
  if (role) el.setAttribute('role', role);
  return el;
}

export function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
