// Chaikin's Polyline Corner-Cutting Algorithm to smooth KMZ fiber lines along
// roads. Every place that turns a raw KMZ line feature into a stable id MUST
// smooth it first with this exact function — the map always renders/hashes
// the smoothed geometry (see smoothFeatureGeometry below), so hashing raw
// coordinates anywhere else produces an id that can never be looked up again.
export function smoothLineCoordinates(coords: [number, number][], iterations = 2): [number, number][] {
  if (!coords || coords.length <= 2) return coords;

  let current = coords;
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: [number, number][] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];

      const q: [number, number] = [
        0.75 * p0[0] + 0.25 * p1[0],
        0.75 * p0[1] + 0.25 * p1[1]
      ];

      const r: [number, number] = [
        0.25 * p0[0] + 0.75 * p1[0],
        0.25 * p0[1] + 0.75 * p1[1]
      ];

      smoothed.push(q);
      smoothed.push(r);
    }
    smoothed.push(current[current.length - 1]);
    current = smoothed;
  }
  return current;
}

// Smooths a LineString/MultiLineString feature's geometry the same way the
// map renders it — shared so ANY code computing this feature's stable id
// (via stableSegmentId) hashes the exact same geometry the map does, rather
// than the raw pre-smoothing coordinates. Used by both FiberMap.tsx (map
// rendering/click handling) and KmzImportSetupModal.tsx (saving core
// capacity set during import) — a route set up during import must resolve
// to the same id the map looks it up by, or its saved data becomes
// permanently unreachable ("Belum Diset" forever, no matter what's saved).
export function smoothFeatureGeometry(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geometry.type === 'LineString') {
    const coords = (geometry as GeoJSON.LineString).coordinates as [number, number][];
    return { type: 'LineString', coordinates: smoothLineCoordinates(coords, 2) };
  } else if (geometry.type === 'MultiLineString') {
    const multi = (geometry as GeoJSON.MultiLineString).coordinates as [number, number][][];
    return { type: 'MultiLineString', coordinates: multi.map(c => smoothLineCoordinates(c, 2)) };
  }
  return geometry;
}

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
