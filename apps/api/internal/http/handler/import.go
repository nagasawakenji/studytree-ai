package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

// ImportHandler handles import endpoints.
type ImportHandler struct {
	usecase *usecase.ImportUsecase
}

// NewImportHandler creates an ImportHandler.
func NewImportHandler(usecase *usecase.ImportUsecase) *ImportHandler {
	return &ImportHandler{usecase: usecase}
}

// ChatGPT handles POST /imports/chatgpt.
func (h *ImportHandler) ChatGPT(w http.ResponseWriter, r *http.Request) {
	if h.usecase == nil {
		writeError(w, http.StatusInternalServerError, "import usecase not configured")
		return
	}

	var req struct {
		BookTitle  string `json:"book_title"`
		SourceText string `json:"source_text"`
		Options    struct {
			MaxDepth        int    `json:"max_depth"`
			ProblemsPerLeaf int    `json:"problems_per_leaf"`
			Language        string `json:"language"`
		} `json:"options"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	result, err := h.usecase.ImportFromChatGPT(r.Context(), usecase.ImportRequest{
		BookTitle:  req.BookTitle,
		SourceText: req.SourceText,
		Options: usecase.ImportOptions{
			MaxDepth:        req.Options.MaxDepth,
			ProblemsPerLeaf: req.Options.ProblemsPerLeaf,
			Language:        req.Options.Language,
		},
	})
	if err != nil {
		switch {
		case errors.Is(err, usecase.ErrImportInvalidRequest), errors.Is(err, usecase.ErrImportInvalidPlan):
			writeError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, usecase.ErrImportProvider):
			writeError(w, http.StatusBadGateway, "failed to generate import plan")
		default:
			writeError(w, http.StatusInternalServerError, "failed to import")
		}
		return
	}

	resp := struct {
		BookID  int64 `json:"book_id"`
		Created struct {
			Nodes     int `json:"nodes"`
			Problems  int `json:"problems"`
			Summaries int `json:"summaries"`
		} `json:"created"`
	}{
		BookID: result.BookID,
	}
	resp.Created.Nodes = result.Created.Nodes
	resp.Created.Problems = result.Created.Problems
	resp.Created.Summaries = result.Created.Summaries

	writeJSON(w, http.StatusOK, resp)
}
