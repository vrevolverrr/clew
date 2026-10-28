import { FileSearch } from '@/attachments/FileSearch';

function searchOf(...paths: string[]): FileSearch {
  const search = new FileSearch();
  for (const path of paths) search.add(path);
  return search;
}

const paths = (search: FileSearch, query: string, limit = 8): string[] => search.search(query, limit).map((file) => file.path);

describe('FileSearch', () => {
  const search = searchOf('notes/Week 1.md', 'week-plan.md', 'archive/old/weekly.md', 'Calculus/limits.pdf', 'manifest.json');

  it('ranks a name that starts with the query, then one that contains it, then a path that contains it', () => {
    const s = searchOf('a/x-week.md', 'week.md', 'week/readme.md', 'weekly-notes.md');
    expect(paths(s, 'week')).toEqual(['week.md', 'weekly-notes.md', 'a/x-week.md', 'week/readme.md']);
  });

  it('matches regardless of case', () => {
    expect(paths(search, 'WEEK 1')).toEqual(['notes/Week 1.md']);
  });

  it('matches letters in order when nothing contains the query', () => {
    expect(paths(search, 'mnfst')).toEqual(['manifest.json']);
    expect(paths(search, 'cllim')).toEqual(['Calculus/limits.pdf']);
  });

  it('breaks a tie by the shorter path', () => {
    expect(paths(search, 'week').slice(0, 2)).toEqual(['week-plan.md', 'notes/Week 1.md']);
  });

  it('returns at most the limit, best first', () => {
    expect(paths(search, 'w', 2)).toEqual(['week-plan.md', 'notes/Week 1.md']);
  });

  it('finds nothing for a query no path holds in order', () => {
    expect(paths(search, 'zzz')).toEqual([]);
  });

  it('sees a file added after a search', () => {
    const live = searchOf('week-plan.md');
    expect(paths(live, 'week')).toEqual(['week-plan.md']);
    live.add('weekly.md');
    expect(paths(live, 'week')).toEqual(['weekly.md', 'week-plan.md']);
  });

  it('splits a path into its name and folder, with no folder at the root, and finds a folder like a file', () => {
    const s = searchOf('notes/Week 1.md', 'a.md');
    s.add('notes/Week 3', true);
    expect(s.get('notes/Week 1.md')).toMatchObject({ name: 'Week 1.md', dir: 'notes', folder: false });
    expect(s.get('a.md')).toMatchObject({ name: 'a.md', dir: '' });
    expect(s.get('notes/Week 3')).toMatchObject({ name: 'Week 3', dir: 'notes', folder: true });
    expect(paths(s, 'week 3')).toEqual(['notes/Week 3']);
  });

  it('drops a removed file', () => {
    const live = searchOf('a.md', 'b.md');
    live.remove('a.md');
    expect(paths(live, '')).toEqual(['b.md']);
    expect(live.get('a.md')).toBeUndefined();
  });
});
