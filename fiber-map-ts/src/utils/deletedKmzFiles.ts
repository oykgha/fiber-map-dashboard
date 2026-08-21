// The 5 default KMZ files (DWD.kmz, POP.kmz, etc.) are re-fetched from
// static assets on every page load, independent of anything saved to the
// backend — deleting one via the KMZ Files panel has nothing to "undo" in
// Postgres for the file's basic existence. The only way to make that
// deletion survive a refresh is to remember it locally and skip
// re-loading that file on the next mount. Plain localStorage rather than
// pulling in a full store-persistence layer, since this is the one thing
// that needs to survive a refresh independent of the backend.
const STORAGE_KEY = 'fiber-map-deleted-default-kmz-files';

export function getDeletedDefaultKmzFiles(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function markDefaultKmzFileDeleted(fileName: string): void {
  try {
    const current = getDeletedDefaultKmzFiles();
    if (!current.includes(fileName)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, fileName]));
    }
  } catch {
    // localStorage unavailable (private browsing, etc.) — deletion just
    // won't survive a refresh in that case, no worse than before this existed.
  }
}
