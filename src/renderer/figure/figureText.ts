import { mapMath } from '@/renderer/figure/figureTex';

const HREF = /\\href\s*\{[^}]*\}\s*\{([^}]*)\}/g;

/** A figure string without anything that links or fetches: links and images become their text, embeds and raw HTML go. */
export function figureText(markdown: string): string {
  return mapMath(
    markdown,
    (math) => math.replace(HREF, '$1'),
    (text) => text
      .replace(/!\[\[[^\]]*\]\]/g, '')
      .replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_, target: string, shown: string) => shown || target)
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1')
      .replace(/<\/?[A-Za-z][^>]*>/g, '')
      .replace(HREF, '$1'),
  );
}
