/** A file or folder the student can mention. `path` is vault-relative; `name` is its last segment and `dir` the rest, empty at the root. */
interface SearchFile {
  path: string;
  name: string;
  dir: string;
  folder: boolean;
}

interface Entry extends SearchFile {
  lowerName: string;
  lowerPath: string;
}

/** Fewer is better: the name starts with the query, contains it, the path contains it, then the letters in order. */
function rank({ lowerName, lowerPath }: Entry, query: string): number {
  if (lowerName.startsWith(query)) return 0;
  if (lowerName.includes(query)) return 1;
  if (lowerPath.includes(query)) return 2;
  if (inOrder(lowerName, query)) return 3;
  return inOrder(lowerPath, query) ? 4 : -1;
}

function inOrder(text: string, query: string): boolean {
  let at = 0;
  for (const letter of query) {
    at = text.indexOf(letter, at) + 1;
    if (at === 0) return false;
  }
  return true;
}

interface Scored {
  entry: Entry;
  rank: number;
}

function compare(a: Scored, b: Scored): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const { path: x } = a.entry;
  const { path: y } = b.entry;
  return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);
}

/** The vault's files, held in memory and searched on each keystroke. */
export class FileSearch {
  private readonly entries = new Map<string, Entry>();

  add(path: string, folder = false): void {
    const slash = path.lastIndexOf('/');
    const name = path.slice(slash + 1);
    this.entries.set(path, { path, name, dir: path.slice(0, Math.max(slash, 0)), folder, lowerName: name.toLowerCase(), lowerPath: path.toLowerCase() });
  }

  remove(path: string): void {
    this.entries.delete(path);
  }

  get(path: string): SearchFile | undefined {
    return this.entries.get(path);
  }

  search(query: string, limit: number): SearchFile[] {
    const needle = query.toLowerCase();
    const best: Scored[] = [];
    for (const entry of this.entries.values()) {
      const score = rank(entry, needle);
      if (score < 0) continue;
      const candidate = { entry, rank: score };
      if (best.length === limit && compare(candidate, best[limit - 1]!) >= 0) continue;
      let at = best.length === limit ? limit - 1 : best.length;
      while (at > 0 && compare(candidate, best[at - 1]!) < 0) {
        best[at] = best[at - 1]!;
        at--;
      }
      best[at] = candidate;
    }
    return best.map(({ entry }) => entry);
  }
}
