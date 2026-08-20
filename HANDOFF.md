# Handoff Notes

## What this is

`fiber-map-ts` was received as a UI/UX-only React dashboard — no backend,
no database. Everything (node data, cable segment edits, XCC port config)
lived only in browser memory (Zustand) and was lost on refresh.

This adds a PostgreSQL database and a Go backend so that editing data in
the UI actually persists.

## What's been added

- `database/schema.sql` — PostgreSQL schema (7 tables: `customers`, `nodes`,
  `fiber_segments`, `sor_files`, `otdr_events`, `xcc_ports`, `xcc_trays`).
  Naming is deliberately verbose/self-describing (not abbreviated) with
  `COMMENT ON TABLE/COLUMN` on anything non-obvious, since the end goal is
  an AI chat feature that will query this schema directly.
- `backend/` — a Go HTTP API (plain `net/http`, `pgx` for Postgres) that
  the frontend now calls on save actions. See "Endpoints" below.
- `fiber-map-ts/src/utils/api.ts` — the frontend's API client.
- Frontend wiring: `FiberSegmentModal.tsx` and `XccPanel.tsx` now call the
  backend in addition to updating local state, so segment edits, XCC
  port/tray edits, and `.sor` file uploads/deletes actually persist.
- **`.sor` file upload** — this used to be fake: the old code only read
  `file.name`/`file.size` off the browser's File object and generated
  random numbers for the OTDR stats, never touching the actual file bytes.
  It's now a real upload: `POST /api/segments/{id}/sor-files` (multipart)
  writes the file to `backend/uploads/{segmentId}/` and a real metadata
  row to `sor_files`. Note the OTDR analysis numbers (wavelength, total
  loss, ORL, events count) are still the frontend's simulated values, not
  parsed from the real `.SOR` binary format — that part was already fake
  before this change and is unchanged; only "does the file/metadata
  actually get saved" was fixed.
- **Overlapping-route cycling** — when a map click lands on more than one
  route at once (overlapping or closely-parallel cables), the segment modal
  now shows a "Rute X / Y" badge that cycles through every candidate at
  that click point, instead of silently only ever showing whichever one
  MapLibre's hit-test happened to return first. See `stableSegmentId` dedup
  + box-tolerance click query in `FiberMap.tsx`'s `onClick`, and
  `overlappingSegments`/`cycleOverlappingSegment` in the store.
- **KMZ import "initial setup" popup** (`KmzImportSetupModal.tsx`) —
  selecting a `.kmz` file no longer merges it into the map immediately.
  It now parses the file and opens a review modal listing every point and
  route found, with a core-capacity picker (96/48/24/12, reusing the same
  chips as the segment modal) per route. Only on confirm do the nodes/lines
  get added to the map, and every route gets saved to the backend
  immediately via the existing `PUT /api/segments/{id}` — so an imported
  route is already in Postgres before it's ever clicked.
- **Per-KMZ-file hide/highlight** (`KmzFilesPanel.tsx`, opened via a new
  "File KMZ" item in the left sidebar) — every node and route now carries
  a `sourceFile` (which `.kmz` it came from, including the 5 default
  startup files: DWD/POP/XCC/ODP/backbone.kmz). The panel lists every
  known file with a visibility toggle and a "SOROT" (highlight) button
  that dims everything except that file's nodes/routes on the map. This
  is local-only state (`kmzFileVisibility`/`highlightedKmzFile` in the
  store) — not persisted to the backend, resets on refresh.
- **Read path for segments** — every save endpoint above was write-only:
  data went into Postgres but nothing ever loaded it back into the UI, so
  a saved segment (or its uploaded `.sor` files) only stayed visible for
  the rest of that same browser session and silently vanished on refresh
  or re-selecting the segment, even though it was safely in the database
  the whole time. `GET /api/segments/{id}` now returns the segment plus
  its `sor_files`, and `FiberSegmentModal.tsx` fetches + merges this in
  whenever a segment is opened (see the `useEffect` near the top of that
  file).
- **Read path for XCC ports/trays/renames** — same fix as above, applied
  to the XCC panel. `GET /api/xcc/{xccId}` returns the node's saved name
  plus every port and tray row, and `XccPanel.tsx` fetches + merges this
  in whenever the panel opens. Verified with a real click → edit a port →
  save → page reload → re-click the same XCC → confirmed the edit was
  still there.
- **Shared core-capacity picker** (`CoreCapacityPicker.tsx`) — the 96/48/24/12
  core chip UI was duplicated between `FiberSegmentModal.tsx` and
  `KmzImportSetupModal.tsx`. Now one component, imported by both.
- **Code-splitting** — `XccPanel` (1300+ lines), `FiberSegmentModal` (800+
  lines), `RouteBuilderModal`, `AlertDrawer`, `PopDetailsModal`,
  `OdpDetailsModal`, and `KmzImportSetupModal` are now `React.lazy` +
  `Suspense`-loaded instead of bundled into the initial chunk, since none
  of them render anything until a user opens them. Cut the main JS chunk
  from ~1.6MB to ~1.5MB. Deliberately did NOT vendor-split `maplibre-gl`
  itself (still the bulk of what remains) — that package needed special
  handling to get its worker script (`maplibre-gl-worker.mjs`) copied into
  `public/assets/` in the first place (Vite doesn't detect it statically),
  and touching its bundling further risked breaking that for a cosmetic
  warning. `vite.config.ts`'s `chunkSizeWarningLimit` was raised instead,
  since a WebGL mapping app legitimately has a large vendor chunk (~410KB
  gzipped is reasonable).
- **Zustand selectors on every component (perf).** All 16 mounted
  components called `useAppStore()` with no selector — i.e. subscribed to
  the *entire* store. Any state change anywhere (hovering a cable, typing
  in search, toggling a filter) re-rendered every one of them, including
  the ~1,700-line `FiberMap` itself. Converted every call site to
  `useAppStore(useShallow(state => ({ ...specific fields... })))` so each
  component only re-renders when the fields it actually uses change. Zero
  visual/behavioral change — verified with a full interactive smoke test
  (sidebar, search, route builder, XCC panel, KMZ files panel, legend
  filters) plus a production build, all clean. This is also *why* the app
  ran noticeably worse on Windows/Chromium than on the mentor's Mac in the
  first place: Chromium-on-Windows is disproportionately slow at
  `backdrop-filter` (used heavily on the ~114 node markers) compared to
  Safari's compositor, so the excess re-renders this fix removes were
  hitting the expensive path far more often on Windows. Deliberately did
  **not** touch the `backdrop-blur`/glassmorphism styling itself — that's
  the bigger remaining perf lever, but it's a real visual change to the UI
  your mentor built, and you asked to keep the delivered UI unmodified, so
  it's left alone unless you decide otherwise. `MultiSegmentBar.tsx` was
  left as-is (not converted) — it's dead code, never actually rendered
  anywhere in the app (removed from the UI in an earlier version per the
  original `ARCHITECTURE.md` changelog, file just never got deleted).

## Known-fixed bugs worth knowing about

- **`fiber_segments.name` was wrongly `UNIQUE`.** Many raw KMZ cable lines
  have no `name` property, so the frontend falls back to a generic
  placeholder ("Untitled Path", "SEGMENT CABLE ROUTE") for multiple,
  unrelated cables. That collided with the unique constraint and caused
  `.sor` uploads (and segment saves) to fail with a Postgres error for any
  segment sharing that placeholder name with an already-saved one. Fixed
  by dropping the constraint — segments are identified by `id`, not name.
- **Segment ids were time-based, not stable.** `FiberMap.tsx`'s cable-click
  handler used to mint a fresh `seg-${Date.now()}` id on every single
  click, with no link back to anything persistent. That meant the read
  path above (`GET /api/segments/{id}`) could never actually find a
  previously-saved segment through normal use — clicking the same cable
  after a refresh generated a *different* random id than whatever was
  saved in Postgres. Fixed with `stableSegmentId()`, now in
  `fiber-map-ts/src/utils/segmentId.ts` (shared by `FiberMap.tsx`'s click
  handler and `KmzImportSetupModal.tsx` — both MUST use this exact
  function so a route set up during import resolves to the same record
  when later clicked): a deterministic hash of the line's name + geometry,
  so the same physical cable always produces the same id, refresh after
  refresh. Verified with a real click → rename → save → page reload →
  re-click → confirmed the rename was still there.
- **Renaming a segment left a stale entry in `segmentStoreMap`.** The map
  is indexed by both `id` and `name`, so a fresh KMZ click (which only
  knows the raw name) can find an existing record. On rename, the code
  added a new `[newName]` key but never removed the old `[oldName]` key —
  it just sat there frozen with pre-rename data. Since a cable's raw KMZ
  name never changes (it's not app state), re-clicking the same cable
  after renaming it hit the stale name-key (checked *before* the id-key in
  `getOrCreateSegmentData`) and reopened the modal showing the old
  name/data, as if the rename hadn't stuck locally — even though it saved
  correctly to Postgres. Fixed in `updateSegmentData()`: the old name-key
  is now deleted whenever the name changes. Verified with a real
  click → rename → close → re-click the same cable → confirmed it showed
  the new name, not the stale one.
- **"MATRIX XCC" button in `ActiveRouteBanner` opened the wrong XCC.**
  `handleReopenXcc` searched `nodes.find(n => n.name === sourceName ||
  n.type === 'XCC')` — since `.find()` evaluates that OR per-element, it
  returned the *first XCC-type node in the entire array* the instant it
  hit one, regardless of whether it matched `sourceName`. In practice this
  meant the button almost always reopened whichever XCC happened to be
  first in the list, not the one the route actually started from. Fixed
  by trying an exact name match first, falling back to "any XCC" only if
  that fails. Verified live: opened a later XCC (not first in the list),
  viewed one of its routes, clicked "MATRIX XCC" → confirmed it reopened
  the correct XCC, not the first one.
- **Multi-select cable mode compared segments by `name`, not `id`.**
  `toggleSelectSegment` and the map's `isSelected` highlight both used
  `.name` for equality. Since many raw KMZ cable lines share the same
  generic placeholder name ("Untitled Path"), selecting one such cable in
  multi-select mode — or the visual "selected" highlight on the map —
  could incorrectly affect *every other* unrelated cable sharing that
  name. Fixed to compare by `id` everywhere (segment ids are guaranteed
  unique; names aren't).
- **`PopDetailsModal`/`OdpDetailsModal` hardcoded "ACTIVE / NORMAL".** The
  status badge never actually read `popNode.status`/`odpNode.status` — it
  always showed the same green "ACTIVE / NORMAL" text no matter what.
  Since the app has real warning/critical nodes (StatCards' counts are
  real), opening a warning/critical POP or ODP's details was silently
  lying about its status. Fixed to reflect the real status with matching
  color (green/amber/rose). Verified live against a real warning-status
  POP node ("OLT OUTDOOR GALUH MAS KARAWANG") — now correctly shows
  "WARNING".
- **Search results incorrectly opened the Alert Drawer alongside the
  correct panel.** `SearchSubmenu.tsx`'s `handleNodeClick` called
  `setActiveAlert(node)` purely to fly the camera there — but
  `activeAlert` is *also* what controls whether the full-screen
  `AlertDrawer` is visible. So clicking any search result (XCC/POP/ODP,
  regardless of actual status) opened the correct detail panel **and**
  an unrelated alert drawer showing a nonsensical "NORMAL ALERT" with
  non-functional "Acknowledge"/"Dispatch Tech" buttons. Fixed by adding
  a separate `flyToCoordinates` store field for camera-only movement,
  decoupled from `activeAlert`. Verified live: clicking a search result
  now opens only the correct panel, no stray alert drawer.
- **Plain `.kml` uploads always failed.** The file picker's `accept`
  attribute advertises both `.kmz` and `.kml`, but `parseKmzToGeoJson()`
  unconditionally called `JSZip.loadAsync(blob)` assuming every upload was
  a zipped `.kmz` archive. A plain `.kml` file is raw XML, not a zip, so
  `JSZip.loadAsync` threw, got swallowed by the outer catch, and silently
  returned `null` — surfaced to the user as a misleading "Gagal membaca
  file... pastikan ini file .kmz/.kml yang valid" even though the KML
  content itself was perfectly valid. Fixed by trying `JSZip.loadAsync`
  first and, only if that throws, falling back to reading the blob as
  plain text and parsing it directly as KML XML. Verified live: uploading
  an unzipped `.kml` test file (`.tmp/doc_pop.kml`) reproduced the bug
  first (console: `Can't find end of central directory : is this a zip
  file?`), then after the fix the same file opened the KMZ import setup
  modal cleanly with zero console errors.
- **Stale `overlappingSegments` leaked into unrelated segments' modal.**
  When a map click hits overlapping cables, `overlappingSegments` is set to
  every candidate at that pixel, and `FiberSegmentModal` shows a "Rute X /
  Y" cycle button driven purely by that global array's length/contents —
  not by whether the currently-open segment actually belongs to it. Any
  other way of opening a segment (confirming a route in Route Builder,
  "Kembali ke Modal Kabel" from an OTDR fault marker, etc.) called
  `setSelectedSegment` directly without touching `overlappingSegments`, so
  a leftover 2+ item array from an earlier overlap click stayed attached to
  a completely unrelated segment opened afterward — showing a wrong index
  (`findIndex` returns -1 for a segment that isn't a member, displayed as
  "Rute 0 / N") and, if clicked, jumping straight to one of those unrelated
  cables. Fixed by moving the invariant into the store: `setSelectedSegment`
  now checks whether the incoming segment is already a member of the
  current `overlappingSegments`; if not, it collapses the list down to just
  that one segment, so the cycle badge only ever appears for a segment that
  was actually reached via an overlapping-lines click. Verified live via a
  temporary `window.__store` debug hook (added to `main.tsx`, reverted
  after testing): seeded a stale 2-item `overlappingSegments`, then opened
  an unrelated segment the way Route Builder does — before the fix this
  showed "RUTE 0 / 2" and cycling jumped to the unrelated fake cable; after
  the fix the badge correctly disappears. Also re-verified the legitimate
  case still works: seeding `overlappingSegments` and then selecting one of
  its own members (mirroring the real map click handler's call order)
  still shows "RUTE 1 / 2" and cycles correctly between the two.
- **Uploaded KMZ nodes got a fresh, unstable id every import.** The custom
  file upload handler (`handleFileUpload` in `FiberMap.tsx`) minted node
  ids as `upload-node-${Date.now()}-${idx}` — the exact same class of bug
  already fixed for segment ids (see `stableSegmentId` above), just not
  caught for nodes at the time. Since a node's Postgres row only ever gets
  created lazily, the first time something about it is saved (rename, XCC
  port/tray edit — see "Node stub note" below), a `Date.now()`-based id
  meant re-importing the same KMZ file later (the only way an imported
  node reappears at all, since custom uploads aren't auto-reloaded on
  refresh) would upsert under a brand-new id instead of updating the same
  row, silently orphaning whatever was saved against the old one. Fixed
  by adding `stableNodeId(name, coordinates, sourceFile)` next to
  `stableSegmentId` in `segmentId.ts` (same djb2 hash, now factored into a
  shared helper) and using it in `handleFileUpload`. Verified live with a
  temporary `window.__store` hook: uploaded the same test `.kml` twice and
  confirmed `pendingKmzImport.nodes[].id` was byte-for-byte identical both
  times (previously would've differed every run since it's `Date.now()`).
- **Re-selecting the same file in the KMZ upload picker did nothing.**
  `<input type="file">` never had its `value` reset after handling a
  selection, and browsers don't fire a `change` event if the picked file
  is identical to what's already in the input's value — so a very common
  real flow (upload → open the setup modal → hit Batal → try the same file
  again, e.g. to fix a typo'd core-capacity choice) silently did nothing on
  the second attempt, with no error and no visible feedback at all. Found
  this while re-verifying the node-id fix above (a Playwright script
  re-uploading the same test file twice showed `pendingKmzImport` become
  `null` after the second attempt). Fixed by resetting the input's `value`
  in the upload handler's `finally` block. Verified live: the same
  before/after script now shows the setup modal opening correctly both
  times in a row for the identical file.
- **Node markers were rebuilt from scratch on every FiberMap render.** The
  ~114 node markers (XCC/POP/ODP/HH/Tiang, each with several backdrop-blur
  layers) were filtered and mapped to JSX inline inside FiberMap's render
  body, with a ~70-line onClick handler redefined per marker per render.
  Since FiberMap subscribes to a lot of store state (map picker mode,
  route builder state, search, drawing mode, etc.), almost any of those
  changing re-ran this filter+map+closure creation for all 114 markers,
  even on renders where nothing about the nodes themselves changed. Split
  into three pieces, same output, no visual change: (1) the filtered node
  list is now `useMemo`'d, keyed only on `nodes`/`mapFilters`/
  `kmzFileVisibility`; (2) the click-handling logic is hoisted into one
  `useCallback`'d `handleNodeClick`, so each marker's own `onClick` is
  just a 1-line wrapper instead of redefining the whole branching handler;
  (3) the marker's visual content moved to a new `NodeMarkerContent.tsx`,
  wrapped in `React.memo`, so a marker only re-renders its (relatively
  expensive) DOM tree when its own `node` or dimmed-state actually changed
  — not on every unrelated store update. Verified live via Playwright
  after the refactor: XCC/POP/ODP marker clicks still open the correct
  panel, Route Builder's "KLIK MAPS UNTUK POINT A" still correctly sets
  Point A from a marker click, and drawing-mode marker clicks still append
  a green-line point — all zero console errors, clean `tsc -b` and
  `vite build`.
- **GPU-layer hint on blurred markers (unverified, experimental).** Added
  Tailwind's `transform-gpu` (compiles to `transform: translateZ(0) ...`,
  confirmed in the built CSS) to the outer wrapper of each marker type
  that actually has a blur effect always rendered (XCC, POP, ODP, HH —
  `Tiang` and the plain-dot fallback have no blur, so left untouched).
  This is a pure compositing hint: it doesn't change layout, color, size,
  or position, only nudges the browser to composite that marker on its
  own GPU layer instead of repainting through it every frame — same
  reasoning as the backdrop-filter/ANGLE cost explained above, just
  without touching the blur itself. Confirmed it compiles correctly and
  doesn't break marker clicks (re-ran the Playwright click-verification
  suite, zero errors). **Not confirmed to actually reduce lag** — this
  wasn't profiled before/after on the machine that's actually slow, so
  treat it as a reasonable, safe experiment, not a proven fix. If it
  doesn't help, it's a one-line-per-marker-type revert (remove
  `transform-gpu` from `NodeMarkerContent.tsx`) with no other side effects
  to unwind — it was applied narrowly precisely so it's cheap to back out.
  Worth noting: applying this hint broadly across every blurred element in
  the app (there are 38 `backdrop-blur` usages across 16 files) was
  deliberately *not* done — forcing too many overlapping elements onto
  separate GPU compositor layers can itself cause a performance problem
  ("layer explosion"), so this was scoped to just the highest-concentration
  spot (114 markers) rather than applied everywhere on a hunch.
  **Follow-up:** the actual root cause of the "laggy on Windows, fine on
  Mac" reports turned out to be simpler and unrelated to any of the above —
  the reporting user's Chrome had hardware acceleration fully disabled
  (`chrome://gpu` showed Canvas/Compositing/Rasterization/WebGL all
  "Software only"), confirmed by the driver info showing `Microsoft Basic
  Render Driver` / `ANGLE_D3D11_WARP` active instead of their actual GPU.
  Toggling hardware acceleration back on in Chrome settings resolved it
  completely — a browser/OS setting, not a code issue. The `useShallow`,
  marker-memoization, and `transform-gpu` changes above are still worth
  keeping (they're genuine, correct optimizations), just weren't the fix
  for that specific report.
- **Cable-color mixing across same-named routes.** Many raw KMZ cable
  lines share the same generic placeholder name ("Untitled Path" — 62 of
  them in the default dataset). `getOrCreateSegmentData` in
  `useAppStore.ts` looked up an existing record by **name before id**
  (`segmentStoreMap[name] || segmentStoreMap[id]`), so the moment ANY
  "Untitled Path" line was clicked, every other "Untitled Path" line
  silently resolved to that exact same `FiberSegmentData` object the next
  time it was touched — setting one route's core capacity visually
  recolored every other same-named route too, and edited its customer/
  technical data as if it were the same physical cable. Fixed by making
  the lookup id-only (`segmentStoreMap[id]`, no name fallback) — `id` is
  a hash of this specific line's own name + geometry, so distinct cables
  never collide even when their names do. Also removed the equivalent
  unsafe name-fallback from `linesGeoJson`'s per-feature color lookup in
  `FiberMap.tsx` for the same reason.
  While fixing this, found a second, deeper problem it depended on: the
  click handler computed each line's id by hashing the geometry returned
  from `map.queryRenderedFeatures()` — but MapLibre internally tiles
  GeoJSON sources for rendering, and `queryRenderedFeatures()` can hand
  back a **tile-clipped fragment** of a line's geometry rather than its
  full original, depending on exactly where along the line the click
  landed. Hashing a fragment produces a different id than hashing the
  full geometry, so the "same" line could resolve to different ids on
  different clicks. Fixed by having `linesGeoJson` stamp its own
  precomputed id onto each feature's `properties.id` (properties survive
  tile-clipping intact even though geometry doesn't) and having the click
  handler read that property directly instead of recomputing a hash.
  Verified with a direct logic-level test (seed two distinct "Untitled
  Path" lines, set one's core capacity via the store, confirm only that
  one line's rendered `coreCapacity` changed — before the fix all 62
  lines flipped color, after the fix exactly 1 did) and end-to-end via
  real Playwright clicks on the actual rendered map.
- **"Gambar Rute" (draw/retrace a cable's physical path) never showed up
  on the map, and silently wiped the segment's saved data.** Two bugs in
  one flow:
  1. `finishDrawingGreenLine` in `useAppStore.ts` only ever updated
     `segmentStoreMap` (the segment's data record) — it never touched
     `geoData` (the actual GeoJSON fed into the map's line layers). The
     pink "drawing in progress" preview line disappears the instant you
     hit "SIMPAN & TERAPKAN", and nothing permanent ever got added in its
     place — the drawn cable simply vanished, and setting a core capacity
     afterward had no rendered line left to color.
  2. `startDrawingGreenLine` nulls `selectedSegment` while drawing (to
     hide the modal), so `finishDrawingGreenLine` reading
     `state.selectedSegment?.name/customerTrunk/technicalData` always saw
     `undefined` — meaning every single "Gambar Rute" edit silently reset
     the segment's name to a generic auto-generated one and wiped its
     customer/technical data (including any core capacity already set)
     back to defaults, even when just retracing an existing, already-
     configured cable.
  Fixed by: (a) reading the segment's prior data from
  `segmentStoreMap[segId]` instead of the now-null `selectedSegment`, so
  retracing preserves the name/customer/technical data that was already
  there; (b) having `finishDrawingGreenLine` return the resulting
  `{id, name}`, and having the "SIMPAN & TERAPKAN" button handler in
  `FiberMap.tsx` use that to merge a real feature into `geoData` —
  replacing the original (pre-retrace) feature if one exists so you don't
  end up with two overlapping lines, or adding a new one if this route
  never had a map feature (e.g. one built via Route Builder). Matching the
  original feature to remove reuses the same id-resolution logic as the
  color-bleeding fix above (`resolveLineFeatureId`), since the original
  feature never carried an explicit id either. Verified live: clicked an
  existing cable named "XCC GAPLEK - POP TBS", drew a new path over it,
  saved — confirmed the feature count in `geoData` stayed the same (98,
  meaning replace not duplicate), the segment kept its original name
  instead of becoming "Jalur Kabel Real Maps (...)", the new line appeared
  in `linesGeoJson` immediately, and setting "48 Core" afterward correctly
  recolored it.
- **Map legend's cable-length badges were mostly fake numbers.** The
  legend (`MapFilterLegendPanel.tsx`) computed each core-capacity
  category's total length by summing only `segmentStoreMap` entries —
  which is populated lazily, only for lines someone has actually clicked —
  and fell back to a **hardcoded placeholder** (`14250`/`28400`/`19150`/
  `8500` meters) whenever nothing had been clicked yet for that category.
  On a fresh page load, every badge showed these made-up numbers with no
  relationship to what was actually on the map. Fixed by adding a
  `cableLengthMeters` calculation in `FiberMap.tsx` (new `CoreCapKey`
  type + `classifyCoreCapacity` helper, shared with `linesGeoJson` so
  both agree on what counts as "96 Core" etc.) that walks every line
  feature actually in `geoData` — not just previously-clicked ones — and
  sums each one's real geometry-derived length by category, passed down
  as a prop. Verified live: fresh load showed `0 m` for every core
  category and the full real total (`335,340 m`) under "Belum Diset"
  (unset) instead of the old fake numbers; clicking a line and assigning
  "48 Core" moved exactly that line's length (`10,230 m`) from "Belum
  Diset" to "Kabel 48 Core" in real time, with the two numbers still
  summing to the original total.

## New feature: delete a loaded KMZ file from the map

The left sidebar's "File KMZ" panel (`KmzFilesPanel.tsx`) already had
per-file hide/highlight toggles; added a delete (trash icon) button per
file, next to those, with a confirm dialog matching the existing "HAPUS
SEMUA" button's wording/pattern. Removes every node and every `geoData`
line feature tagged with that file's `sourceFile`, and drops the file
from `knownKmzFiles`/`kmzFileVisibility`/clears `highlightedKmzFile` if it
was the one highlighted.

Same scope as "HAPUS SEMUA": **view-only**, doesn't touch anything already
saved to the backend (segments/nodes/`.sor` files for that file's routes
stay in Postgres — a refresh reloads the 5 default KMZ files from scratch
regardless, so deleting one of those just removes it until the next
refresh; a custom-uploaded file wouldn't come back at all, per the
existing "custom KMZ imports don't survive a refresh" gap noted above).

Implementation note: `KmzFilesPanel` is mounted in `App.tsx`, outside
`FiberMap.tsx`, so it has no direct access to `geoData`/`setGeoData`
(local state inside `FiberMap`). Bridged the same way `pendingKmzImport`
already bridges the opposite direction (import): `KmzFilesPanel` calls
`requestDeleteKmzFile(fileName)`, which just sets a
`deleteKmzFileRequest` field in the store; a `useEffect` in `FiberMap.tsx`
watches that field, does the actual `nodes`/`geoData` filtering, then
calls `finalizeKmzFileDeletion(fileName)` to clean up the store's own
bookkeeping and clear the request.

Verified live: before deleting `DWD.kmz`, node count was 114 (62 of them
DWD.kmz's); after clicking delete + confirming, node count dropped to 52
(exactly DWD.kmz's 62 removed), the other files' node counts (e.g. POP.kmz
at 18) were untouched, and `DWD.kmz` correctly disappeared from
`knownKmzFiles` while the other 4 remained.

## What's still open

- **Real `.SOR` file parsing** — uploads are now genuinely persisted (see
  above), but the OTDR analysis numbers shown per file are still simulated
  client-side, not derived from parsing the actual `.SOR` binary format
  (Bellcore/Telcordia GR-196). That's a much bigger, specialized task.
- **`otdr_events`** — the table for individual fault/splice/bend events
  within a trace exists but nothing writes to it yet (depends on real
  `.SOR` parsing above).
- **Custom-uploaded KMZ files don't survive a page refresh.** The default 5
  KMZ files (`DWD.kmz`, `POP.kmz`, `XCC.kmz`, `ODP.kmz`, `backbone.kmz`) are
  fetched from static assets on every mount, so they always reappear. A
  file the user imports via "IMPOR FILE .KMZ" is only ever merged into
  local Zustand state (`setNodes`/`setGeoData`) — there's no re-fetch
  mechanism for it, so on refresh its routes/nodes vanish from the map
  entirely, even though the routes' segment data was already saved to
  Postgres via `saveSegment` in `KmzImportSetupModal.tsx` (and would
  rehydrate correctly *if* the route ever became clickable again — it just
  can't, since the line isn't on the map to click). The backend has no
  concept of "this raw KMZ file was uploaded" at all, only the derived
  segment/node data touched so far. Fixing this properly needs the backend
  to store the uploaded file itself (or its parsed feature set) and an
  endpoint the frontend can call on mount to re-merge every previously
  confirmed import, alongside the default 5 — a real feature, not a small
  bug fix, so left undone rather than attempted as a drive-by change.
- **Full node sync from KMZ to backend** — the `nodes` table only gets
  populated lazily, one row at a time, whenever something about that node
  gets saved (see "Node stub" note below). There's no bulk import of the
  KMZ-derived node list into Postgres yet.
- No auth on the API — fine for local dev, not for anything public.

## Node stub note (read this before touching `xcc.go` / `segments.go`)

The backend's `nodes` table doesn't get bulk-populated from KMZ — it only
learns about a node the first time something related to it is saved (a
segment, an XCC port, a rename). Every save endpoint that touches a node
therefore also upserts a minimal "node stub" (id/name/type/coords/status)
passed up from the frontend, to satisfy the foreign key. This is a
deliberate shortcut, not an oversight — see `backend/internal/api/xcc.go`
`upsertNodeStub`. Building a real "sync all nodes" endpoint would let this
go away.

## Dependencies

What actually needs to be installed to run this, and the versions this was
built/tested against:

| Tool | Version used here | Needed for |
|---|---|---|
| Node.js | 22.16.0 (any current LTS — 20+ — should work) | Frontend (`fiber-map-ts/`) |
| npm | 10.9.2 (comes with Node) | Installing frontend packages |
| Go | 1.26.5 (pinned in `backend/go.mod` — `go 1.26.5`) | Backend (`backend/`) |
| PostgreSQL | 16 | Database |

All frontend package versions are pinned in `fiber-map-ts/package.json`
(React 19, Vite 8, MapLibre GL 6, Zustand 5, etc. — `npm install` resolves
all of it, nothing to install by hand). All backend package versions are
pinned in `backend/go.mod` (just `pgx/v5` and its own indirect deps —
`go build` resolves them automatically). No global installs needed beyond
Node, Go, and Postgres themselves.

**On a Mac specifically**, the easiest way to get Node/Go/Postgres is
[Homebrew](https://brew.sh):
```bash
brew install node go postgresql@16
brew services start postgresql@16
```

## Running it locally

**1. Database — pick whichever's easier for you, Docker or a native install:**

**Option A: Docker** (no local Postgres install needed, identical on
Mac/Windows/Linux)
```bash
docker start fiber-map-postgres
# if the container doesn't exist yet:
docker run -d --name fiber-map-postgres \
  -e POSTGRES_USER=fiber_admin \
  -e POSTGRES_PASSWORD=fiber_dev_local_only \
  -e POSTGRES_DB=fiber_network \
  -p 5432:5432 \
  -v fiber-map-postgres-data:/var/lib/postgresql/data \
  postgres:16
# then apply the schema once:
docker cp database/schema.sql fiber-map-postgres:/schema.sql
docker exec fiber-map-postgres psql -U fiber_admin -d fiber_network -f /schema.sql
```

**Option B: Native Postgres install**

*macOS:*
```bash
brew install postgresql@16
brew services start postgresql@16
createuser -s fiber_admin 2>/dev/null  # or: psql postgres -c "CREATE ROLE fiber_admin LOGIN PASSWORD 'fiber_dev_local_only';"
psql postgres -c "ALTER ROLE fiber_admin WITH PASSWORD 'fiber_dev_local_only';"
psql postgres -c "CREATE DATABASE fiber_network OWNER fiber_admin;"
psql -U fiber_admin -d fiber_network -f database/schema.sql
```

*Windows:*
1. Install PostgreSQL 16 — `winget install PostgreSQL.PostgreSQL.16` (or the
   installer from postgresql.org). Note the `postgres` superuser password
   you set during install.
2. Create the app role + database and apply the schema:
   ```bash
   psql -U postgres -c "CREATE ROLE fiber_admin LOGIN PASSWORD 'fiber_dev_local_only';"
   psql -U postgres -c "CREATE DATABASE fiber_network OWNER fiber_admin;"
   psql -U fiber_admin -d fiber_network -f database/schema.sql
   ```
3. Postgres runs as a Windows service automatically after install/reboot —
   no need to start anything manually going forward.

Either way, the backend expects the same connection details by default:
user `fiber_admin`, password `fiber_dev_local_only`, database `fiber_network`,
on `localhost:5432`. Override with the `DATABASE_URL` env var if yours differ.

**2. Backend (Go):**

*macOS / Linux:*
```bash
cd backend
go build -o server ./cmd/server
./server
# listens on :8080, connects to the DB above by default
```

*Windows:*
```bash
cd backend
go build -o server.exe ./cmd/server
./server.exe
```
> Note: on Windows, Defender may flag/delete freshly-built Go binaries as
> a false positive. If `go build` fails with a "contains a virus" error,
> add a Defender exclusion for the `backend/` folder (Windows Security →
> Virus & threat protection → Manage settings → Exclusions). This is a
> Windows-only quirk — doesn't happen on Mac.

**3. Frontend:**
```bash
cd fiber-map-ts
npm install
npm run dev
```
Open the printed localhost URL. The backend's CORS is wide open (`*`) for
local dev convenience — tighten this before any real deployment.

## Endpoints so far

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | DB connectivity check |
| GET | `/api/nodes` | List all nodes |
| GET | `/api/segments/{id}` | Fetch a segment + its uploaded `.sor` files |
| PUT | `/api/segments/{id}` | Save segment technical/customer data |
| PATCH | `/api/nodes/{id}` | Rename a node |
| GET | `/api/xcc/{xccId}` | Fetch an XCC's saved name, ports, and trays |
| PUT | `/api/xcc/{xccId}/ports/{group}/{number}` | Save one XCC port's config |
| PUT | `/api/xcc/{xccId}/trays/{index}` | Save a tray's name/target |
| POST | `/api/segments/{id}/sor-files` | Upload a `.sor` file (multipart) |
| DELETE | `/api/sor-files/{id}` | Delete an uploaded `.sor` file |
