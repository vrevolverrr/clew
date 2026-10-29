/** The file name being typed after an `@` that starts the input or follows whitespace. */
export function mentionTrigger(text: string, cursor: number): { start: number; query: string } | null {
  const match = /(?<=^|\s)@([^\s@]*)$/.exec(text.slice(0, cursor));
  return match ? { start: match.index, query: match[1] } : null;
}

/**
 * Where the text names a picked file: an `@` and one of the tokens, after whitespace or at the start and before whitespace or the end.
 * A token may hold spaces, so the text is matched against the known tokens, longest first.
 */
export function mentionTokens(text: string, tokens: readonly string[]): { start: number; end: number; token: string }[] {
  if (!tokens.length) return [];
  const names = [...tokens].sort((a, b) => b.length - a.length).map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<=^|\\s)@(?:${names.join('|')})(?=\\s|$)`, 'g');
  return Array.from(text.matchAll(pattern), (match) => ({ start: match.index, end: match.index + match[0].length, token: match[0].slice(1) }));
}

/** The text that names a file in the message: its name, numbered when another picked file has taken the name. */
export function mentionToken(name: string, taken: ReadonlySet<string>): string {
  let token = name;
  for (let n = 2; taken.has(token); n++) token = `${name} (${n})`;
  return token;
}
