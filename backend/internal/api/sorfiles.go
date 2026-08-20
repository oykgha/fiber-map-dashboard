package api

import (
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// POST /api/segments/{id}/sor-files — multipart upload: the actual .SOR
// file bytes get written to disk, and a real (not fabricated) metadata row
// is written to sor_files. The wavelength/loss/orl/events fields are
// currently simulated client-side (see FiberSegmentModal.tsx) rather than
// parsed from the real .SOR binary format — that's out of scope for now,
// so they're persisted as-received rather than re-derived here.
func (s *Server) handleUploadSorFile(w http.ResponseWriter, r *http.Request) {
	segmentID := r.PathValue("id")

	if err := r.ParseMultipartForm(32 << 20); err != nil { // 32MB limit
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid multipart form: " + err.Error()})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing file: " + err.Error()})
		return
	}
	defer file.Close()

	sorID := r.FormValue("id")
	if sorID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id is required"})
		return
	}

	segmentName := r.FormValue("segmentName")
	if segmentName == "" {
		segmentName = segmentID
	}

	var segmentLengthKm *float64
	if v := r.FormValue("segmentLengthKm"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			segmentLengthKm = &f
		}
	}

	wavelengthNm := parseOptionalFloat(r.FormValue("wavelengthNm"))
	fiberLengthKm := parseOptionalFloat(r.FormValue("fiberLengthKm"))
	totalLossDb := parseOptionalFloat(r.FormValue("totalLossDb"))
	orlDb := parseOptionalFloat(r.FormValue("orlDb"))
	eventsCount := parseOptionalInt(r.FormValue("eventsCount"))

	uploadsDir := filepath.Join("uploads", segmentID)
	if err := os.MkdirAll(uploadsDir, 0o755); err != nil {
		log.Printf("sor upload: MkdirAll(%q) failed: %v", uploadsDir, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create uploads dir: " + err.Error()})
		return
	}

	safeName := filepath.Base(header.Filename)
	storagePath := filepath.Join(uploadsDir, sorID+"_"+safeName)

	dest, err := os.Create(storagePath)
	if err != nil {
		log.Printf("sor upload: os.Create(%q) failed: %v", storagePath, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save file: " + err.Error()})
		return
	}
	written, err := io.Copy(dest, file)
	dest.Close()
	if err != nil {
		log.Printf("sor upload: io.Copy to %q failed: %v", storagePath, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "write file: " + err.Error()})
		return
	}

	ctx := r.Context()
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		log.Printf("sor upload: DB.Begin failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO fiber_segments (id, name, length_km)
		VALUES ($1, $2, $3)
		ON CONFLICT (id) DO NOTHING
	`, segmentID, segmentName, segmentLengthKm); err != nil {
		log.Printf("sor upload: ensure segment %q failed: %v", segmentID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ensure segment: " + err.Error()})
		return
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO sor_files (
			id, segment_id, file_name, file_size_bytes, storage_path,
			wavelength_nm, fiber_length_km, total_loss_db, orl_db, events_count
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (id) DO UPDATE SET
			file_name = EXCLUDED.file_name,
			file_size_bytes = EXCLUDED.file_size_bytes,
			storage_path = EXCLUDED.storage_path,
			wavelength_nm = EXCLUDED.wavelength_nm,
			fiber_length_km = EXCLUDED.fiber_length_km,
			total_loss_db = EXCLUDED.total_loss_db,
			orl_db = EXCLUDED.orl_db,
			events_count = EXCLUDED.events_count
	`, sorID, segmentID, header.Filename, written, storagePath,
		wavelengthNm, fiberLengthKm, totalLossDb, orlDb, eventsCount)
	if err != nil {
		log.Printf("sor upload: insert sor_files row (id=%q, segment=%q) failed: %v", sorID, segmentID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save sor_files row: " + err.Error()})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("sor upload: tx.Commit failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	log.Printf("sor upload: OK id=%q segment=%q file=%q bytes=%d path=%q", sorID, segmentID, header.Filename, written, storagePath)

	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "saved",
		"id":          sorID,
		"storagePath": storagePath,
		"sizeBytes":   written,
	})
}

// DELETE /api/sor-files/{id}
func (s *Server) handleDeleteSorFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx := r.Context()

	var storagePath *string
	err := s.DB.QueryRow(ctx, `SELECT storage_path FROM sor_files WHERE id = $1`, id).Scan(&storagePath)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if _, err := s.DB.Exec(ctx, `DELETE FROM sor_files WHERE id = $1`, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if storagePath != nil {
		_ = os.Remove(*storagePath) // best-effort; row deletion is the source of truth
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted", "id": id})
}

func parseOptionalFloat(s string) *float64 {
	if s == "" {
		return nil
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil
	}
	return &f
}

func parseOptionalInt(s string) *int {
	if s == "" {
		return nil
	}
	i, err := strconv.Atoi(s)
	if err != nil {
		return nil
	}
	return &i
}
