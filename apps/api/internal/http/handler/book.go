package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

// BookHandler handles book endpoints.
type BookHandler struct {
	usecase *usecase.BookUsecase
}

// NewBookHandler creates a BookHandler.
func NewBookHandler(usecase *usecase.BookUsecase) *BookHandler {
	return &BookHandler{usecase: usecase}
}

// Create handles POST /books.
func (h *BookHandler) Create(w http.ResponseWriter, r *http.Request) {
	if h.usecase == nil {
		writeError(w, http.StatusInternalServerError, "book usecase not configured")
		return
	}

	var req struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	book, err := h.usecase.Create(r.Context(), req.Title)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create book")
		return
	}

	resp := struct {
		ID    int64  `json:"id"`
		Title string `json:"title"`
	}{
		ID:    book.ID,
		Title: book.Title,
	}
	writeJSON(w, http.StatusCreated, resp)
}

// List handles GET /books.
func (h *BookHandler) List(w http.ResponseWriter, r *http.Request) {
	if h.usecase == nil {
		writeError(w, http.StatusInternalServerError, "book usecase not configured")
		return
	}

	books, err := h.usecase.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list books")
		return
	}

	resp := make([]struct {
		ID        int64     `json:"id"`
		Title     string    `json:"title"`
		CreatedAt time.Time `json:"created_at"`
	}, 0, len(books))
	for _, book := range books {
		resp = append(resp, struct {
			ID        int64     `json:"id"`
			Title     string    `json:"title"`
			CreatedAt time.Time `json:"created_at"`
		}{
			ID:        book.ID,
			Title:     book.Title,
			CreatedAt: book.CreatedAt,
		})
	}
	writeJSON(w, http.StatusOK, resp)
}
