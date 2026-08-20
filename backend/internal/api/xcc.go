package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// NodeStub carries just enough info about a node (POP/XCC/ODP/etc.) for the
// backend to upsert it into the nodes table on the fly. This is needed
// because nodes currently only exist in the frontend's Zustand store
// (parsed client-side from KMZ) — the backend has never seen them until
// the first time something about them gets saved.
type NodeStub struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	NodeType  string  `json:"nodeType"`
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
	Status    string  `json:"status"`
}

func upsertNodeStub(ctx context.Context, tx pgx.Tx, n NodeStub) error {
	status := n.Status
	if status == "" {
		status = "normal"
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO nodes (id, name, node_type, longitude, latitude, status)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			longitude = EXCLUDED.longitude,
			latitude = EXCLUDED.latitude,
			status = EXCLUDED.status,
			updated_at = now()
	`, n.ID, n.Name, n.NodeType, n.Longitude, n.Latitude, status)
	return err
}

// ---- PATCH /api/nodes/{id} — rename a node (e.g. XCC cabinet rename) ----

type RenameNodeRequest struct {
	Node NodeStub `json:"node"`
}

func (s *Server) handleRenameNode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req RenameNodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body: " + err.Error()})
		return
	}
	req.Node.ID = id
	if req.Node.Name == "" {
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

	if err := upsertNodeStub(ctx, tx, req.Node); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save node: " + err.Error()})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "saved", "id": id})
}

// ---- GET /api/xcc/{xccId} — read path counterpart to the save handlers
// below. Until now, XCC port/tray/rename saves were write-only, same class
// of bug the segment read-path already fixed: edit a port, refresh, and the
// change appears to vanish even though it's safely in Postgres, because
// nothing ever reloads it into the frontend's Zustand store. ----

type XccPortResponse struct {
	PortGroup      string   `json:"portGroup"`
	PortNumber     int      `json:"portNumber"`
	Status         string   `json:"status"`
	ServiceName    string   `json:"serviceName"`
	Remarks        string   `json:"remarks"`
	DestNodeName   string   `json:"destNodeName"`
	DestPortNumber *int     `json:"destPortNumber,omitempty"`
	AttenuationDb  *float64 `json:"attenuation,omitempty"`
	ConnectorType  string   `json:"connectorType"`
}

type XccTrayResponse struct {
	TrayIndex      int     `json:"trayIndex"`
	TrayName       *string `json:"trayName,omitempty"`
	TargetNodeName *string `json:"targetNodeName,omitempty"`
}

type XccResponse struct {
	ID    string            `json:"id"`
	Name  *string           `json:"name,omitempty"`
	Ports []XccPortResponse `json:"ports"`
	Trays []XccTrayResponse `json:"trays"`
}

func (s *Server) handleGetXcc(w http.ResponseWriter, r *http.Request) {
	xccID := r.PathValue("xccId")
	ctx := r.Context()

	resp := XccResponse{ID: xccID, Ports: []XccPortResponse{}, Trays: []XccTrayResponse{}}

	err := s.DB.QueryRow(ctx, `SELECT name FROM nodes WHERE id = $1`, xccID).Scan(&resp.Name)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	portRows, err := s.DB.Query(ctx, `
		SELECT port_group, port_number, status, service_name, remarks,
		       dest_node_name, dest_port_number, attenuation_db, connector_type
		FROM xcc_ports
		WHERE xcc_node_id = $1
	`, xccID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer portRows.Close()

	for portRows.Next() {
		var p XccPortResponse
		var serviceName, remarks, destNodeName, connectorType *string
		if err := portRows.Scan(&p.PortGroup, &p.PortNumber, &p.Status, &serviceName, &remarks,
			&destNodeName, &p.DestPortNumber, &p.AttenuationDb, &connectorType); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if serviceName != nil {
			p.ServiceName = *serviceName
		}
		if remarks != nil {
			p.Remarks = *remarks
		}
		if destNodeName != nil {
			p.DestNodeName = *destNodeName
		}
		if connectorType != nil {
			p.ConnectorType = *connectorType
		}
		resp.Ports = append(resp.Ports, p)
	}

	trayRows, err := s.DB.Query(ctx, `
		SELECT tray_index, tray_name, target_node_name FROM xcc_trays WHERE xcc_node_id = $1
	`, xccID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer trayRows.Close()

	for trayRows.Next() {
		var t XccTrayResponse
		if err := trayRows.Scan(&t.TrayIndex, &t.TrayName, &t.TargetNodeName); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		resp.Trays = append(resp.Trays, t)
	}

	writeJSON(w, http.StatusOK, resp)
}

// ---- PUT /api/xcc/{xccId}/ports/{group}/{number} — save one port's config ----

type SaveXccPortRequest struct {
	Node           NodeStub `json:"node"`
	Status         string   `json:"status"`
	ServiceName    string   `json:"serviceName"`
	Remarks        string   `json:"remarks"`
	DestNodeName   string   `json:"destNodeName"`
	DestPortNumber *int     `json:"destPortId"`
	AttenuationDb  *float64 `json:"attenuation"`
	ConnectorType  string   `json:"connectorType"`
}

func (s *Server) handleSaveXccPort(w http.ResponseWriter, r *http.Request) {
	xccID := r.PathValue("xccId")
	group := r.PathValue("group")
	portNumber, err := strconv.Atoi(r.PathValue("number"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid port number"})
		return
	}
	if group != "k1" && group != "k2" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "port group must be k1 or k2"})
		return
	}

	var req SaveXccPortRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body: " + err.Error()})
		return
	}
	req.Node.ID = xccID

	ctx := r.Context()
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer tx.Rollback(ctx)

	if err := upsertNodeStub(ctx, tx, req.Node); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save node: " + err.Error()})
		return
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO xcc_ports (
			xcc_node_id, port_group, port_number, status, service_name,
			remarks, dest_node_name, dest_port_number, attenuation_db, connector_type
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (xcc_node_id, port_group, port_number) DO UPDATE SET
			status = EXCLUDED.status,
			service_name = EXCLUDED.service_name,
			remarks = EXCLUDED.remarks,
			dest_node_name = EXCLUDED.dest_node_name,
			dest_port_number = EXCLUDED.dest_port_number,
			attenuation_db = EXCLUDED.attenuation_db,
			connector_type = EXCLUDED.connector_type,
			updated_at = now()
	`, xccID, group, portNumber, req.Status, req.ServiceName, req.Remarks,
		req.DestNodeName, req.DestPortNumber, req.AttenuationDb, req.ConnectorType)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save port: " + err.Error()})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// ---- PUT /api/xcc/{xccId}/trays/{index} — save a tray's name and/or target ----

type SaveXccTrayRequest struct {
	Node           NodeStub `json:"node"`
	TrayName       *string  `json:"trayName"`
	TargetNodeName *string  `json:"targetNodeName"`
}

func (s *Server) handleSaveXccTray(w http.ResponseWriter, r *http.Request) {
	xccID := r.PathValue("xccId")
	trayIndex, err := strconv.Atoi(r.PathValue("index"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid tray index"})
		return
	}

	var req SaveXccTrayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body: " + err.Error()})
		return
	}
	req.Node.ID = xccID

	ctx := r.Context()
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	defer tx.Rollback(ctx)

	if err := upsertNodeStub(ctx, tx, req.Node); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save node: " + err.Error()})
		return
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO xcc_trays (xcc_node_id, tray_index, tray_name, target_node_name)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (xcc_node_id, tray_index) DO UPDATE SET
			tray_name = COALESCE(EXCLUDED.tray_name, xcc_trays.tray_name),
			target_node_name = COALESCE(EXCLUDED.target_node_name, xcc_trays.target_node_name)
	`, xccID, trayIndex, req.TrayName, req.TargetNodeName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save tray: " + err.Error()})
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}
