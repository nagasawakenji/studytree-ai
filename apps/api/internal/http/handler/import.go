package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/request_id"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

// ImportHandler handles import endpoints.
type ImportHandler struct {
	usecase *usecase.ImportUsecase
	log     *logger.Logger
}

// NewImportHandler creates an ImportHandler.
func NewImportHandler(usecase *usecase.ImportUsecase, log *logger.Logger) *ImportHandler {
	return &ImportHandler{usecase: usecase, log: log}
}

// ChatGPT handles POST /imports/chatgpt.
func (h *ImportHandler) ChatGPT(w http.ResponseWriter, r *http.Request) {
	requestID := request_id.FromContext(r.Context())

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
		h.writeImportError(w, http.StatusBadRequest, "invalid json", "invalid_request", requestID, req.BookTitle, len(req.SourceText))
		return
	}
	if h.log != nil {
		h.log.Info("import_chatgpt_start", map[string]any{
			"request_id":         requestID,
			"book_title":         req.BookTitle,
			"source_text_length": len(req.SourceText),
		})
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
			h.writeImportError(w, http.StatusBadRequest, err.Error(), "invalid_request", requestID, req.BookTitle, len(req.SourceText))
		case errors.Is(err, usecase.ErrImportInvalidJSONFromLLM):
			h.writeImportError(w, http.StatusBadGateway, "failed to import", "invalid_json_from_llm", requestID, req.BookTitle, len(req.SourceText))
		case errors.Is(err, usecase.ErrImportProvider):
			h.writeImportError(w, http.StatusBadGateway, "failed to import", "llm_provider_error", requestID, req.BookTitle, len(req.SourceText))
		default:
			h.writeImportError(w, http.StatusInternalServerError, "failed to import", "", requestID, req.BookTitle, len(req.SourceText))
		}
		return
	}

	resp := struct {
		BookID        int64  `json:"book_id"`
		RequestID     string `json:"request_id"`
		CreatedCounts struct {
			Books     int `json:"books"`
			Nodes     int `json:"nodes"`
			Problems  int `json:"problems"`
			Summaries int `json:"summaries"`
		} `json:"created_counts"`
		FilteredCounts struct {
			SummariesInvalid int `json:"summaries_invalid"`
			ProblemsInvalid  int `json:"problems_invalid"`
		} `json:"filtered_counts"`
	}{
		BookID:    result.BookID,
		RequestID: requestID,
	}
	resp.CreatedCounts.Books = result.Created.Books
	resp.CreatedCounts.Nodes = result.Created.Nodes
	resp.CreatedCounts.Problems = result.Created.Problems
	resp.CreatedCounts.Summaries = result.Created.Summaries
	resp.FilteredCounts.SummariesInvalid = result.Filtered.SummariesInvalid
	resp.FilteredCounts.ProblemsInvalid = result.Filtered.ProblemsInvalid

	if h.log != nil {
		h.log.Info("import_chatgpt_end", map[string]any{
			"request_id":         requestID,
			"book_title":         req.BookTitle,
			"source_text_length": len(req.SourceText),
			"created_counts": map[string]int{
				"books":     result.Created.Books,
				"nodes":     result.Created.Nodes,
				"summaries": result.Created.Summaries,
				"problems":  result.Created.Problems,
			},
			"filtered_counts": map[string]int{
				"summaries_invalid": result.Filtered.SummariesInvalid,
				"problems_invalid":  result.Filtered.ProblemsInvalid,
			},
		})
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *ImportHandler) writeImportError(
	w http.ResponseWriter,
	status int,
	message string,
	reason string,
	requestID string,
	bookTitle string,
	sourceTextLength int,
) {
	payload := map[string]string{"error": message}
	if reason != "" {
		payload["reason"] = reason
	}
	if requestID != "" {
		payload["request_id"] = requestID
	}

	if h.log != nil {
		fields := map[string]any{
			"request_id":         requestID,
			"book_title":         bookTitle,
			"source_text_length": sourceTextLength,
			"status":             status,
			"error":              message,
		}
		if reason != "" {
			fields["reason"] = reason
		}
		h.log.Error("import_chatgpt_end", fields)
	}

	writeJSON(w, status, payload)
}
