import { quoteMatches } from '@/tour/locateQuote';

const BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,pre,div';
// Rendered math repeats itself as hidden text, and the copy button is not the note's.
const NOT_NOTE = 'script,style,.copy-code-button,.math,mjx-container';

/**
 * Where `quote` is drawn inside `root`, in document order. Reading view keeps no source offsets, so the text on
 * screen is searched; the quote matches as it does in the source, and a break between blocks reads as a space.
 */
export function renderedQuote(root: HTMLElement, quote: string): Range[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(NOT_NOTE) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let text = '';
  // Where each text node starts in `text`, ascending.
  const starts: Array<{ at: number; node: Text }> = [];
  let block: Element | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const here = node.parentElement?.closest(BLOCKS) ?? null;
    if (block && here !== block) text += ' ';
    block = here;
    starts.push({ at: text.length, node });
    text += node.data;
  }
  const point = (index: number): { node: Text; offset: number } => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle]!.at <= index) low = middle;
      else high = middle - 1;
    }
    return { node: starts[low]!.node, offset: index - starts[low]!.at };
  };
  return quoteMatches(text, quote, true).map(({ start, end }) => {
    const range = document.createRange();
    const from = point(start);
    const to = point(end - 1);
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset + 1);
    return range;
  });
}
