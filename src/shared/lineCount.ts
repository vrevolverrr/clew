/** Lines a text spans; a final line break ends the last line instead of starting another. */
export function lineCount(text: string): number {
  return (text.replace(/\r?\n$/, '').match(/\n/g)?.length ?? 0) + 1;
}
