import type { App, TFile, WorkspaceLeaf } from 'obsidian';

/** The tab that shows `file`, loaded or not: a tab Obsidian has not loaded yet has no file view, but its saved state names the file. */
export function leafOfFile(app: App, file: TFile): WorkspaceLeaf | undefined {
  let found: WorkspaceLeaf | undefined;
  // A truthy return would stop the walk early, so the first match is kept instead.
  app.workspace.iterateRootLeaves((leaf) => {
    found ??= leaf.getViewState().state?.file === file.path ? leaf : undefined;
  });
  return found;
}
