package api

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	DB *pgxpool.Pool
}

func NewServer(pool *pgxpool.Pool) *Server {
	return &Server{DB: pool}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /api/nodes", s.handleListNodes)
	mux.HandleFunc("GET /api/segments", s.handleListSegments)
	mux.HandleFunc("GET /api/segments/{id}", s.handleGetSegment)
	mux.HandleFunc("POST /api/segments/{id}", s.handleSaveSegment)
	mux.HandleFunc("PATCH /api/nodes/{id}", s.handleRenameNode)
	mux.HandleFunc("GET /api/xcc/{xccId}", s.handleGetXcc)
	mux.HandleFunc("POST /api/xcc/{xccId}/ports/{group}/{number}", s.handleSaveXccPort)
	mux.HandleFunc("POST /api/xcc/{xccId}/trays/{index}", s.handleSaveXccTray)
	mux.HandleFunc("POST /api/segments/{id}/sor-files", s.handleUploadSorFile)
	mux.HandleFunc("DELETE /api/sor-files/{id}", s.handleDeleteSorFile)
	mux.HandleFunc("DELETE /api/kmz-files/{fileName}", s.handleDeleteKmzFile)
	return withLogging(withCORS(mux))
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// withLogging prints every request's method, path, status, and duration to
// the server's stdout — makes it possible to see whether a request from
// the browser even reached the backend, and what happened if it did.
func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("%s %s -> %d (%s)", r.Method, r.URL.Path, rec.status, time.Since(start))
	})
}

// withCORS allows the Vite dev server (different port = different origin)
// to call this API directly from the browser during local development.
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if err := s.DB.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "db unreachable", "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type Node struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	NodeType   string  `json:"node_type"`
	Longitude  float64 `json:"longitude"`
	Latitude   float64 `json:"latitude"`
	Status     string  `json:"status"`
	SourceFile *string `json:"sourceFile,omitempty"`
}

// GET /api/nodes — every node ever saved, used by the frontend on startup
// to rebuild nodes that don't come from the 5 default KMZ files (custom
// uploads, anything renamed/edited that's since disappeared from the map).
func (s *Server) handleListNodes(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query(r.Context(),
		`SELECT id, name, node_type, longitude, latitude, status, source_file FROM nodes ORDER BY name`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	nodes := []Node{}
	for rows.Next() {
		var n Node
		if err := rows.Scan(&n.ID, &n.Name, &n.NodeType, &n.Longitude, &n.Latitude, &n.Status, &n.SourceFile); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		nodes = append(nodes, n)
	}

	writeJSON(w, http.StatusOK, nodes)
}

// DELETE /api/kmz-files/{fileName} — permanently removes every node and
// fiber segment tagged with this source_file. Without this, the KMZ Files
// panel's delete button only ever removed things from the current browser
// tab's local state: the 5 default files get re-fetched from their static
// .kmz assets on every page load regardless of anything deleted, and (once
// startup hydration from the database existed) any other saved node/route
// would just get pulled right back in on the next refresh anyway. "Delete"
// has to mean delete.
func (s *Server) handleDeleteKmzFile(w http.ResponseWriter, r *http.Request) {
	fileName := r.PathValue("fileName")
	if fileName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing file name"})
		return
	}
	ctx := r.Context()

	tx, err := s.DB.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer tx.Rollback(ctx)

	// "Data Tersimpan" is the frontend's display label for a node/segment
	// that predates source_file existing (or was saved through a path that
	// never sent one) — that literal string was never written to the
	// database, the real rows have source_file IS NULL. Matching it here
	// too means deleting that pseudo-file in the UI actually clears them,
	// instead of silently matching zero rows and having them reappear on
	// every future load. Keep this string in sync with FiberMap.tsx's
	// fallback label.
	const untaggedPseudoFile = "Data Tersimpan"
	matchNullToo := fileName == untaggedPseudoFile

	// Collect .sor file paths before the cascade deletes their rows, so the
	// physical files on disk can be cleaned up too (best-effort, same as
	// handleDeleteSorFile — the DB row is the source of truth either way).
	var storagePaths []string
	rows, err := tx.Query(ctx, `
		SELECT sf.storage_path FROM sor_files sf
		JOIN fiber_segments fs ON fs.id = sf.segment_id
		WHERE fs.source_file = $1 OR ($2 AND fs.source_file IS NULL)
	`, fileName, matchNullToo)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			rows.Close()
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		storagePaths = append(storagePaths, p)
	}
	rows.Close()

	segResult, err := tx.Exec(ctx, `DELETE FROM fiber_segments WHERE source_file = $1 OR ($2 AND source_file IS NULL)`, fileName, matchNullToo)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete segments: " + err.Error()})
		return
	}
	nodeResult, err := tx.Exec(ctx, `DELETE FROM nodes WHERE source_file = $1 OR ($2 AND source_file IS NULL)`, fileName, matchNullToo)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete nodes: " + err.Error()})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	for _, p := range storagePaths {
		_ = os.Remove(p)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":         "deleted",
		"segmentsDeleted": segResult.RowsAffected(),
		"nodesDeleted":    nodeResult.RowsAffected(),
	})
}
