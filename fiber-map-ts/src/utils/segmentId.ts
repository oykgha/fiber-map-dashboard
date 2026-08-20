// djb2 hash, shared by every stable-id helper below.
function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// Deterministic id for a cable line, derived from its name + geometry (djb2 hash).
// Must NOT be time-based (Date.now()) — the backend persists data keyed by this
// id, so clicking the same physical cable (or importing it via KMZ) has to
// produce the same id every time, including after a page refresh when nothing
// is cached client-side yet. Otherwise saved data (customer/technical data,
// uploaded .sor files) becomes unreachable the moment the page reloads, since
// a fresh random id would never match what's already in Postgres.
//
// Shared between FiberMap.tsx's click handler and KmzImportSetupModal.tsx —
// both MUST use this exact function so a route set up during import resolves
// to the same segment record when later clicked on the map.
export function stableSegmentId(name: string, geometry: unknown): string {
  return `seg-${djb2(`${name}|${JSON.stringify(geometry)}`)}`;
}

// Same reasoning as stableSegmentId, for point nodes imported from a custom
// (user-uploaded) KMZ file. FiberMap.tsx's handleFileUpload used to mint
// `upload-node-${Date.now()}-${idx}`, a fresh id every time — so touching an
// imported node (rename, XCC port/tray save) persisted a "node stub" row to
// Postgres under an id that would never come up again, since re-uploading
// the same file (the only way these nodes reappear at all, since custom
// imports aren't auto-reloaded on refresh) mints new random ids. Hashing the
// name + coordinates + source file instead means the same physical node in
// the same file always resolves to the same backend row.
export function stableNodeId(name: string, coordinates: [number, number], sourceFile: string): string {
  return `node-${djb2(`${sourceFile}|${name}|${coordinates[0]}|${coordinates[1]}`)}`;
}
