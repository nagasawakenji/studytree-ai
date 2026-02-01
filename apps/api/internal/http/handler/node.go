package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

// NodeHandler handles node endpoints.
type NodeHandler struct {
	usecase *usecase.NodeUsecase
}

// NewNodeHandler creates a NodeHandler.
func NewNodeHandler(usecase *usecase.NodeUsecase) *NodeHandler {
	return &NodeHandler{usecase: usecase}
}

// Create handles POST /books/{book_id}/nodes.
func (h *NodeHandler) Create(w http.ResponseWriter, r *http.Request) {
	if h.usecase == nil {
		writeError(w, http.StatusInternalServerError, "node usecase not configured")
		return
	}

	bookID, err := parseBookID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid book_id")
		return
	}

	var req struct {
		ParentID   *int64 `json:"parent_id"`
		OrderIndex int    `json:"order_index"`
		Title      string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	node, err := h.usecase.Create(r.Context(), bookID, req.ParentID, req.OrderIndex, req.Title)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create node")
		return
	}

	resp := struct {
		ID         int64  `json:"id"`
		BookID     int64  `json:"book_id"`
		ParentID   *int64 `json:"parent_id"`
		OrderIndex int    `json:"order_index"`
		Title      string `json:"title"`
	}{
		ID:         node.ID,
		BookID:     node.BookID,
		ParentID:   node.ParentID,
		OrderIndex: node.OrderIndex,
		Title:      node.Title,
	}
	writeJSON(w, http.StatusCreated, resp)
}

// List handles GET /books/{book_id}/nodes.
func (h *NodeHandler) List(w http.ResponseWriter, r *http.Request) {
	if h.usecase == nil {
		writeError(w, http.StatusInternalServerError, "node usecase not configured")
		return
	}

	bookID, err := parseBookID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid book_id")
		return
	}

	parentID, err := parseParentID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid parent_id")
		return
	}

	nodes, err := h.usecase.List(r.Context(), bookID, parentID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list nodes")
		return
	}

	resp := make([]struct {
		ID         int64  `json:"id"`
		ParentID   *int64 `json:"parent_id"`
		OrderIndex int    `json:"order_index"`
		Title      string `json:"title"`
	}, 0, len(nodes))
	for _, node := range nodes {
		resp = append(resp, struct {
			ID         int64  `json:"id"`
			ParentID   *int64 `json:"parent_id"`
			OrderIndex int    `json:"order_index"`
			Title      string `json:"title"`
		}{
			ID:         node.ID,
			ParentID:   node.ParentID,
			OrderIndex: node.OrderIndex,
			Title:      node.Title,
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

func parseBookID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "book_id"), 10, 64)
}

func parseParentID(r *http.Request) (*int64, error) {
	value := r.URL.Query().Get("parent_id")
	if value == "" || value == "null" {
		return nil, nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}
