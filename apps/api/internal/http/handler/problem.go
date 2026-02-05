package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

// ProblemHandler handles problem endpoints.
type ProblemHandler struct {
	usecase *usecase.ProblemUsecase
}

// NewProblemHandler creates a ProblemHandler.
func NewProblemHandler(usecase *usecase.ProblemUsecase) *ProblemHandler {
	return &ProblemHandler{usecase: usecase}
}

// ListByNode handles GET /nodes/{node_id}/problems.
func (h *ProblemHandler) ListByNode(w http.ResponseWriter, r *http.Request) {
	if h.usecase == nil {
		writeError(w, http.StatusInternalServerError, "problem usecase not configured")
		return
	}

	nodeID, err := parseNodeID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node_id")
		return
	}

	problems, err := h.usecase.ListByNode(r.Context(), nodeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list problems")
		return
	}

	resp := make([]struct {
		ID        int64           `json:"id"`
		NodeID    int64           `json:"node_id"`
		Kind      string          `json:"kind"`
		SchemaVer int             `json:"schema_ver"`
		Content   json.RawMessage `json:"content"`
		CreatedAt time.Time       `json:"created_at"`
		UpdatedAt time.Time       `json:"updated_at"`
	}, 0, len(problems))
	for _, problem := range problems {
		resp = append(resp, struct {
			ID        int64           `json:"id"`
			NodeID    int64           `json:"node_id"`
			Kind      string          `json:"kind"`
			SchemaVer int             `json:"schema_ver"`
			Content   json.RawMessage `json:"content"`
			CreatedAt time.Time       `json:"created_at"`
			UpdatedAt time.Time       `json:"updated_at"`
		}{
			ID:        problem.ID,
			NodeID:    problem.NodeID,
			Kind:      problem.Kind,
			SchemaVer: problem.SchemaVer,
			Content:   problem.Content,
			CreatedAt: problem.CreatedAt,
			UpdatedAt: problem.UpdatedAt,
		})
	}

	writeJSON(w, http.StatusOK, resp)
}

// Create handles POST /nodes/{node_id}/problems.
func (h *ProblemHandler) Create(w http.ResponseWriter, r *http.Request) {
	if h.usecase == nil {
		writeError(w, http.StatusInternalServerError, "problem usecase not configured")
		return
	}

	nodeID, err := parseNodeID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node_id")
		return
	}

	var req struct {
		Kind      string `json:"kind"`
		SchemaVer *int   `json:"schema_ver"`
		Content   struct {
			Title    string `json:"title"`
			BodyMD   string `json:"body_md"`
			AnswerMD string `json:"answer_md"`
		} `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Kind == "" {
		req.Kind = "qa"
	}
	if req.Content.Title == "" {
		writeError(w, http.StatusBadRequest, "content.title is required")
		return
	}
	schemaVer := 1

	contentBytes, err := json.Marshal(req.Content)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encode content")
		return
	}

	problem, err := h.usecase.Create(r.Context(), nodeID, req.Kind, schemaVer, contentBytes)
	if err != nil {
		if errors.Is(err, usecase.ErrNodeNotFound) {
			writeError(w, http.StatusNotFound, "node not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create problem")
		return
	}

	resp := struct {
		ID        int64           `json:"id"`
		NodeID    int64           `json:"node_id"`
		Kind      string          `json:"kind"`
		SchemaVer int             `json:"schema_ver"`
		Content   json.RawMessage `json:"content"`
		CreatedAt time.Time       `json:"created_at"`
		UpdatedAt time.Time       `json:"updated_at"`
	}{
		ID:        problem.ID,
		NodeID:    problem.NodeID,
		Kind:      problem.Kind,
		SchemaVer: problem.SchemaVer,
		Content:   problem.Content,
		CreatedAt: problem.CreatedAt,
		UpdatedAt: problem.UpdatedAt,
	}
	writeJSON(w, http.StatusCreated, resp)
}
