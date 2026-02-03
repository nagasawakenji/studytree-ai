package handler

import (
	"encoding/json"
	"errors"
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

// Update handles PATCH /books/{book_id}/nodes/{node_id}.
func (h *NodeHandler) Update(w http.ResponseWriter, r *http.Request) {
	if h.usecase == nil {
		writeError(w, http.StatusInternalServerError, "node usecase not configured")
		return
	}

	bookID, err := parseBookID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid book_id")
		return
	}

	nodeID, err := parseNodeID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node_id")
		return
	}

	var req struct {
		ParentID   *int64 `json:"parent_id"`
		OrderIndex int    `json:"order_index"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.OrderIndex < 0 {
		writeError(w, http.StatusBadRequest, "order_index must be non-negative")
		return
	}

	node, err := h.usecase.Update(r.Context(), bookID, nodeID, req.ParentID, req.OrderIndex)
	if err != nil {
		if errors.Is(err, usecase.ErrNodeNotFound) {
			writeError(w, http.StatusNotFound, "node not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to update node")
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
	writeJSON(w, http.StatusOK, resp)
}

// Reorder handles PUT /books/{book_id}/nodes/reorder.
func (h *NodeHandler) Reorder(w http.ResponseWriter, r *http.Request) {
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
		ParentID *int64  `json:"parent_id"`
		NodeIDs  []int64 `json:"node_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	if err := h.usecase.Reorder(r.Context(), bookID, req.ParentID, req.NodeIDs); err != nil {
		if errors.Is(err, usecase.ErrInvalidNodeReorder) {
			writeError(w, http.StatusBadRequest, "invalid node_ids for parent")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to reorder nodes")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Move handles PATCH /books/{book_id}/nodes/{node_id}/move.
func (h *NodeHandler) Move(w http.ResponseWriter, r *http.Request) {
	if h.usecase == nil {
		writeError(w, http.StatusInternalServerError, "node usecase not configured")
		return
	}

	bookID, err := parseBookID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid book_id")
		return
	}

	nodeID, err := parseNodeID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid node_id")
		return
	}

	var req struct {
		DstBookID     int64  `json:"dst_book_id"`
		DstParentID   *int64 `json:"dst_parent_id"`
		DstOrderIndex int    `json:"dst_order_index"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.DstBookID == 0 {
		writeError(w, http.StatusBadRequest, "dst_book_id is required")
		return
	}
	if req.DstOrderIndex < 0 {
		writeError(w, http.StatusBadRequest, "dst_order_index must be non-negative")
		return
	}

	node, err := h.usecase.MoveSubtree(r.Context(), bookID, nodeID, req.DstBookID, req.DstParentID, req.DstOrderIndex)
	if err != nil {
		if errors.Is(err, usecase.ErrNodeNotFound) {
			writeError(w, http.StatusNotFound, "node not found")
			return
		}
		if errors.Is(err, usecase.ErrInvalidMoveParent) {
			writeError(w, http.StatusBadRequest, "invalid destination parent")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to move node")
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
	writeJSON(w, http.StatusOK, resp)
}

func parseBookID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "book_id"), 10, 64)
}

func parseNodeID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "node_id"), 10, 64)
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
