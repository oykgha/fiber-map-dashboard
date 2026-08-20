package api

import (
	"encoding/json"
	"log"
	"net/http"
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
	mux.HandleFunc("GET /api/segments/{id}", s.handleGetSegment)
	mux.HandleFunc("PUT /api/segments/{id}", s.handleSaveSegment)
	mux.HandleFunc("PATCH /api/nodes/{id}", s.handleRenameNode)
	mux.HandleFunc("GET /api/xcc/{xccId}", s.handleGetXcc)
	mux.HandleFunc("PUT /api/xcc/{xccId}/ports/{group}/{number}", s.handleSaveXccPort)
	mux.HandleFunc("PUT /api/xcc/{xccId}/trays/{index}", s.handleSaveXccTray)
	mux.HandleFunc("POST /api/segments/{id}/sor-files", s.handleUploadSorFile)
	mux.HandleFunc("DELETE /api/sor-files/{id}", s.handleDeleteSorFile)
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS")
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
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	NodeType  string  `json:"node_type"`
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
	Status    string  `json:"status"`
}

func (s *Server) handleListNodes(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query(r.Context(),
		`SELECT id, name, node_type, longitude, latitude, status FROM nodes ORDER BY name`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	nodes := []Node{}
	for rows.Next() {
		var n Node
		if err := rows.Scan(&n.ID, &n.Name, &n.NodeType, &n.Longitude, &n.Latitude, &n.Status); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		nodes = append(nodes, n)
	}

	writeJSON(w, http.StatusOK, nodes)
}
