-- Fiber Map Dashboard — PostgreSQL schema (draft v1)
--
-- Naming convention: snake_case, fully spelled out, domain vocabulary
-- (pop/xcc/odp/hh — already standard fiber-industry terms) kept as-is
-- since it matches what the UI itself calls things. Every table/column
-- that isn't self-explanatory has a COMMENT so an LLM (or a human)
-- can introspect the schema without reading application code.
--
-- Source of truth for these shapes: fiber-map-ts/src/store/useAppStore.ts
-- and fiber-map-ts/src/components/XccPanel.tsx (port/tray key patterns).

-- ============================================================
-- CUSTOMERS
-- ============================================================
-- Currently the UI only captures a single free-text "customer trunk"
-- string on a segment. This table gives that room to grow into real
-- customer records without breaking the current UI — for now, only
-- trunk_name needs to be populated.
CREATE TABLE customers (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    trunk_name      TEXT UNIQUE,
    contact_person  TEXT,
    phone           TEXT,
    email           TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE customers IS 'Customers/trunks that fiber segments are leased to or built for.';
COMMENT ON COLUMN customers.trunk_name IS 'Free-text trunk/customer label as currently entered in the UI (FiberSegmentModal "Customer/Trunk" field).';

-- ============================================================
-- NODES  (POP, XCC, ODP, HH, Tiang, ODC — one physical network asset)
-- ============================================================
CREATE TABLE nodes (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    node_type         TEXT NOT NULL CHECK (node_type IN ('ODC', 'XCC', 'POP', 'ODP', 'HH', 'Tiang')),
    longitude         DOUBLE PRECISION NOT NULL,
    latitude          DOUBLE PRECISION NOT NULL,
    status            TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'warning', 'critical')),
    status_handling   TEXT CHECK (status_handling IN ('open', 'in_progress', 'resolved')),
    attenuation_db    DOUBLE PRECISION,
    segment_label     TEXT,
    technician_notes  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE nodes IS 'A single physical network asset marker on the map: a POP, XCC cabinet, ODP box, handhole (HH), pole (Tiang), or ODC node.';
COMMENT ON COLUMN nodes.node_type IS 'Asset category: ODC (distribution cabinet), XCC (cross-connect cabinet), POP (point of presence), ODP (optical distribution point), HH (handhole), Tiang (utility pole).';
COMMENT ON COLUMN nodes.segment_label IS 'Free-text segment/group label carried over from KMZ import — not a foreign key to fiber_segments.';
COMMENT ON COLUMN nodes.status_handling IS 'Alert triage state, only meaningful when status is warning or critical.';

CREATE INDEX idx_nodes_node_type ON nodes(node_type);
CREATE INDEX idx_nodes_status ON nodes(status);

-- ============================================================
-- FIBER SEGMENTS  (a cable run between two nodes)
-- ============================================================
CREATE TABLE fiber_segments (
    id                       TEXT PRIMARY KEY,
    name                     TEXT NOT NULL,
    length_km                NUMERIC(10, 3),
    customer_id              TEXT REFERENCES customers(id) ON DELETE SET NULL,
    technical_data           TEXT,
    core_count               INTEGER,
    attenuation_rate_db_per_km NUMERIC(10, 4),
    node_a_label             TEXT,
    node_z_label             TEXT,
    core_capacity            TEXT CHECK (core_capacity IN ('kabel12', 'kabel24', 'kabel48', 'kabel96')),
    drawn_route_coordinates  JSONB,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE fiber_segments IS 'A single fiber cable run (segment), identified by id, connecting node_a to node_z. Central table for FiberSegmentModal data. Note: name is NOT unique — many raw KMZ cable lines have no name and share a generic placeholder like "Untitled Path" until a user renames them.';
COMMENT ON COLUMN fiber_segments.core_capacity IS 'Cable capacity classification used for map line color/thickness: kabel12/24/48/96 = 12/24/48/96-core cable.';
COMMENT ON COLUMN fiber_segments.drawn_route_coordinates IS 'JSON array of [longitude, latitude] pairs for manually-drawn or road-snapped cable routes (Route Builder / Drawing Mode). Null if the route comes only from the original KMZ import.';
COMMENT ON COLUMN fiber_segments.node_a_label IS 'Free-text label for the route start point (not a foreign key — may be a coordinate string, not an actual nodes.id).';
COMMENT ON COLUMN fiber_segments.node_z_label IS 'Free-text label for the route end point (not a foreign key — may be a coordinate string, not an actual nodes.id).';

CREATE INDEX idx_fiber_segments_customer_id ON fiber_segments(customer_id);
CREATE INDEX idx_fiber_segments_name ON fiber_segments(name);

-- ============================================================
-- SOR FILES  (OTDR measurement files uploaded per segment)
-- ============================================================
CREATE TABLE sor_files (
    id                TEXT PRIMARY KEY,
    segment_id        TEXT NOT NULL REFERENCES fiber_segments(id) ON DELETE CASCADE,
    file_name         TEXT NOT NULL,
    file_size_bytes   BIGINT,
    storage_path      TEXT,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    wavelength_nm     NUMERIC(10, 2),
    fiber_length_km   NUMERIC(10, 3),
    total_loss_db     NUMERIC(10, 3),
    orl_db            NUMERIC(10, 3),
    events_count      INTEGER
);
COMMENT ON TABLE sor_files IS 'Metadata for an uploaded .SOR OTDR measurement file, one per fiber segment upload.';
COMMENT ON COLUMN sor_files.storage_path IS 'Location of the actual uploaded file bytes (disk path or object storage key) — this table holds metadata only, not the file content itself.';
COMMENT ON COLUMN sor_files.orl_db IS 'Optical Return Loss in dB, as parsed from the .SOR file.';

CREATE INDEX idx_sor_files_segment_id ON sor_files(segment_id);

-- ============================================================
-- OTDR EVENTS  (fault/splice/bend events detected within a .SOR file)
-- ============================================================
CREATE TABLE otdr_events (
    id              BIGSERIAL PRIMARY KEY,
    sor_file_id     TEXT NOT NULL REFERENCES sor_files(id) ON DELETE CASCADE,
    event_name      TEXT NOT NULL,
    event_type      TEXT NOT NULL CHECK (event_type IN ('macrobend', 'splice', 'connector', 'break')),
    distance_km     NUMERIC(10, 3),
    loss_db         NUMERIC(10, 3),
    reflectance_db  NUMERIC(10, 3),
    longitude       DOUBLE PRECISION,
    latitude        DOUBLE PRECISION
);
COMMENT ON TABLE otdr_events IS 'Individual fault/splice/bend/connector events detected in an OTDR trace, shown as map markers and in the segment modal event list.';

CREATE INDEX idx_otdr_events_sor_file_id ON otdr_events(sor_file_id);

-- ============================================================
-- XCC PORTS  (port-level config inside an XCC cabinet)
-- ============================================================
CREATE TABLE xcc_ports (
    id              BIGSERIAL PRIMARY KEY,
    xcc_node_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    port_group      TEXT NOT NULL CHECK (port_group IN ('k1', 'k2')),
    port_number     INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('active', 'available', 'broken', 'reserved')),
    service_name    TEXT,
    remarks         TEXT,
    dest_node_name  TEXT,
    dest_port_number INTEGER,
    attenuation_db  NUMERIC(10, 3),
    connector_type  TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (xcc_node_id, port_group, port_number)
);
COMMENT ON TABLE xcc_ports IS 'Per-port configuration inside an XCC cross-connect cabinet. Replaces the current UI-only customPortConfigs key-value map (e.g. key "xcc123_k1_5") with real rows.';
COMMENT ON COLUMN xcc_ports.port_group IS 'Which of the two physical port banks in the cabinet this port belongs to (k1 = kelompok 1, k2 = kelompok 2).';
COMMENT ON COLUMN xcc_ports.dest_node_name IS 'Free-text name of the node this port is patched to — not a foreign key, matches current UI behavior.';

-- ============================================================
-- XCC TRAYS  (tray-level naming/target inside an XCC cabinet)
-- ============================================================
CREATE TABLE xcc_trays (
    id               BIGSERIAL PRIMARY KEY,
    xcc_node_id      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    tray_index       INTEGER NOT NULL,
    tray_name        TEXT,
    target_node_name TEXT,
    UNIQUE (xcc_node_id, tray_index)
);
COMMENT ON TABLE xcc_trays IS 'One tray (holds 12 ports) inside an XCC cabinet — custom name and fly-to target, replacing the UI-only customTrayLabels/customTrayTargets maps.';
