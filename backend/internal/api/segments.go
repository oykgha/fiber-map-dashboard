package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type SaveSegmentRequest struct {
	Name                   string      `json:"name"`
	LengthKm               *float64    `json:"lengthKm"`
	CustomerTrunk          string      `json:"customerTrunk"`
	TechnicalData          string      `json:"technicalData"`
	CoreCount              *int        `json:"coreCount"`
	AttenuationRateDbPerKm *float64    `json:"attenuationRate"`
	NodeA                  string      `json:"nodeA"`
	NodeZ                  string      `json:"nodeZ"`
	CoreCapacity           string      `json:"coreCapacity"`
	// This cable's current line geometry as [[lng, lat], ...] — sent on
	// EVERY save now, not just hand-drawn/retraced ones, so the frontend
	// can rebuild this line on the map after a refresh without needing the
	// original KMZ file again. See drawn_route_coordinates's comment in
	// schema.sql.
	Geometry   [][]float64 `json:"geometry"`
	SourceFile string      `json:"sourceFile"`
}

var nonSlugChars = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	slug := strings.ToLower(strings.TrimSpace(s))
	slug = nonSlugChars.ReplaceAllString(slug, "-")
	return strings.Trim(slug, "-")
}

// handleSaveSegment upserts a fiber segment's technical + customer data.
// This is the backend counterpart of the "SIMPAN PERUBAHAN SEGMENT" button
// in FiberSegmentModal.tsx — previously that button only updated local
// Zustand state and nothing was persisted.
func (s *Server) handleSaveSegment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing segment id"})
		return
	}

	var req SaveSegmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body: " + err.Error()})
		return
	}
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}

	ctx := r.Context()

	tx, err := s.DB.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer tx.Rollback(ctx)

	var customerID *string
	if trunk := strings.TrimSpace(req.CustomerTrunk); trunk != "" {
		custID := "customer-" + slugify(trunk)
		var returnedID string
		err := tx.QueryRow(ctx, `
			INSERT INTO customers (id, name, trunk_name)
			VALUES ($1, $2, $2)
			ON CONFLICT (trunk_name) DO UPDATE SET updated_at = now()
			RETURNING id
		`, custID, trunk).Scan(&returnedID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save customer: " + err.Error()})
			return
		}
		customerID = &returnedID
	}

	var geometryJSON any
	if len(req.Geometry) > 0 {
		b, err := json.Marshal(req.Geometry)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		geometryJSON = b
	}
	var sourceFile *string
	if req.SourceFile != "" {
		sourceFile = &req.SourceFile
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO fiber_segments (
			id, name, length_km, customer_id, technical_data, core_count,
			attenuation_rate_db_per_km, node_a_label, node_z_label, core_capacity,
			drawn_route_coordinates, source_file
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF($10, ''), $11, $12)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			length_km = COALESCE(EXCLUDED.length_km, fiber_segments.length_km),
			customer_id = COALESCE(EXCLUDED.customer_id, fiber_segments.customer_id),
			technical_data = EXCLUDED.technical_data,
			core_count = COALESCE(EXCLUDED.core_count, fiber_segments.core_count),
			attenuation_rate_db_per_km = COALESCE(EXCLUDED.attenuation_rate_db_per_km, fiber_segments.attenuation_rate_db_per_km),
			node_a_label = COALESCE(NULLIF(EXCLUDED.node_a_label, ''), fiber_segments.node_a_label),
			node_z_label = COALESCE(NULLIF(EXCLUDED.node_z_label, ''), fiber_segments.node_z_label),
			core_capacity = COALESCE(EXCLUDED.core_capacity, fiber_segments.core_capacity),
			drawn_route_coordinates = COALESCE(EXCLUDED.drawn_route_coordinates, fiber_segments.drawn_route_coordinates),
			source_file = COALESCE(EXCLUDED.source_file, fiber_segments.source_file),
			updated_at = now()
	`, id, req.Name, req.LengthKm, customerID, req.TechnicalData, req.CoreCount,
		req.AttenuationRateDbPerKm, req.NodeA, req.NodeZ, req.CoreCapacity, geometryJSON, sourceFile)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save segment: " + err.Error()})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "saved", "id": id})
}

type SorFileResponse struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Size          string   `json:"size"`
	UploadDate    string   `json:"uploadDate"`
	Wavelength    string   `json:"wavelength,omitempty"`
	FiberLengthKm *float64 `json:"fiberLengthKm,omitempty"`
	TotalLossDb   *float64 `json:"totalLossDb,omitempty"`
	OrlDb         *float64 `json:"orlDb,omitempty"`
	EventsCount   *int     `json:"eventsCount,omitempty"`
}

type SegmentResponse struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	LengthKm        *float64          `json:"lengthKm,omitempty"`
	CustomerTrunk   string            `json:"customerTrunk,omitempty"`
	TechnicalData   string            `json:"technicalData,omitempty"`
	CoreCount       *int              `json:"coreCount,omitempty"`
	AttenuationRate *float64          `json:"attenuationRate,omitempty"`
	NodeA           string            `json:"nodeA,omitempty"`
	NodeZ           string            `json:"nodeZ,omitempty"`
	CoreCapacity    string            `json:"coreCapacity,omitempty"`
	Geometry        [][]float64       `json:"geometry,omitempty"`
	SourceFile      string            `json:"sourceFile,omitempty"`
	SorFiles        []SorFileResponse `json:"sorFiles"`
}

// handleGetSegment is the read-path counterpart to handleSaveSegment — until
// now nothing ever fetched persisted data back into the frontend, so a saved
// segment (or its uploaded .sor files) would only show up for the rest of
// that same browser session and vanish on refresh/reselect, even though it
// was safely in Postgres the whole time.
func (s *Server) handleGetSegment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx := r.Context()

	var resp SegmentResponse
	var lengthKm *float64
	var customerTrunk *string
	var technicalData *string
	var coreCount *int
	var attenuationRate *float64
	var nodeA, nodeZ *string
	var coreCapacity *string
	var geometryRaw []byte
	var sourceFile *string

	err := s.DB.QueryRow(ctx, `
		SELECT s.id, s.name, s.length_km, c.trunk_name, s.technical_data,
		       s.core_count, s.attenuation_rate_db_per_km, s.node_a_label, s.node_z_label,
		       s.core_capacity, s.drawn_route_coordinates, s.source_file
		FROM fiber_segments s
		LEFT JOIN customers c ON c.id = s.customer_id
		WHERE s.id = $1
	`, id).Scan(&resp.ID, &resp.Name, &lengthKm, &customerTrunk, &technicalData,
		&coreCount, &attenuationRate, &nodeA, &nodeZ, &coreCapacity, &geometryRaw, &sourceFile)

	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "segment not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	resp.LengthKm = lengthKm
	if customerTrunk != nil {
		resp.CustomerTrunk = *customerTrunk
	}
	if technicalData != nil {
		resp.TechnicalData = *technicalData
	}
	resp.CoreCount = coreCount
	resp.AttenuationRate = attenuationRate
	if coreCapacity != nil {
		resp.CoreCapacity = *coreCapacity
	}
	if sourceFile != nil {
		resp.SourceFile = *sourceFile
	}
	if len(geometryRaw) > 0 {
		if err := json.Unmarshal(geometryRaw, &resp.Geometry); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "decode geometry: " + err.Error()})
			return
		}
	}
	if nodeA != nil {
		resp.NodeA = *nodeA
	}
	if nodeZ != nil {
		resp.NodeZ = *nodeZ
	}

	rows, err := s.DB.Query(ctx, `
		SELECT id, file_name, file_size_bytes, uploaded_at, wavelength_nm,
		       fiber_length_km, total_loss_db, orl_db, events_count
		FROM sor_files
		WHERE segment_id = $1
		ORDER BY uploaded_at DESC
	`, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	resp.SorFiles = []SorFileResponse{}
	for rows.Next() {
		var f SorFileResponse
		var sizeBytes *int64
		var uploadedAt time.Time
		var wavelengthNm *float64

		if err := rows.Scan(&f.ID, &f.Name, &sizeBytes, &uploadedAt, &wavelengthNm,
			&f.FiberLengthKm, &f.TotalLossDb, &f.OrlDb, &f.EventsCount); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		if sizeBytes != nil {
			f.Size = fmt.Sprintf("%.1f KB", float64(*sizeBytes)/1024)
		}
		f.UploadDate = uploadedAt.Format("2006-01-02T15:04:05Z07:00")
		if wavelengthNm != nil {
			f.Wavelength = fmt.Sprintf("%.0f nm", *wavelengthNm)
		}

		resp.SorFiles = append(resp.SorFiles, f)
	}

	writeJSON(w, http.StatusOK, resp)
}

// GET /api/segments — every segment that has a geometry saved, used by the
// frontend on startup to rebuild routes that don't come from the 5 default
// KMZ files (custom uploads, "Gambar Rute" drawn/retraced paths). Segments
// with no geometry are skipped — there'd be nothing to draw for them, e.g.
// a segment that only ever got touched via a .sor upload before this
// feature existed.
func (s *Server) handleListSegments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rows, err := s.DB.Query(ctx, `
		SELECT s.id, s.name, s.length_km, c.trunk_name, s.technical_data,
		       s.core_count, s.attenuation_rate_db_per_km, s.node_a_label, s.node_z_label,
		       s.core_capacity, s.drawn_route_coordinates, s.source_file
		FROM fiber_segments s
		LEFT JOIN customers c ON c.id = s.customer_id
		WHERE s.drawn_route_coordinates IS NOT NULL
		ORDER BY s.name
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	segments := []SegmentResponse{}
	for rows.Next() {
		var resp SegmentResponse
		var lengthKm *float64
		var customerTrunk *string
		var technicalData *string
		var coreCount *int
		var attenuationRate *float64
		var nodeA, nodeZ *string
		var coreCapacity *string
		var geometryRaw []byte
		var sourceFile *string

		if err := rows.Scan(&resp.ID, &resp.Name, &lengthKm, &customerTrunk, &technicalData,
			&coreCount, &attenuationRate, &nodeA, &nodeZ, &coreCapacity, &geometryRaw, &sourceFile); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		resp.LengthKm = lengthKm
		if customerTrunk != nil {
			resp.CustomerTrunk = *customerTrunk
		}
		if technicalData != nil {
			resp.TechnicalData = *technicalData
		}
		resp.CoreCount = coreCount
		resp.AttenuationRate = attenuationRate
		if nodeA != nil {
			resp.NodeA = *nodeA
		}
		if nodeZ != nil {
			resp.NodeZ = *nodeZ
		}
		if coreCapacity != nil {
			resp.CoreCapacity = *coreCapacity
		}
		if sourceFile != nil {
			resp.SourceFile = *sourceFile
		}
		if len(geometryRaw) > 0 {
			if err := json.Unmarshal(geometryRaw, &resp.Geometry); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "decode geometry: " + err.Error()})
				return
			}
		}
		resp.SorFiles = []SorFileResponse{}

		segments = append(segments, resp)
	}

	writeJSON(w, http.StatusOK, segments)
}
