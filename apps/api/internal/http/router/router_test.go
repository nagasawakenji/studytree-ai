package router

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/request_id"
)

func TestHealthz(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	handler := NewRouter(log, nil)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/healthz", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	if response.Header().Get(request_id.HeaderName) == "" {
		t.Fatalf("expected %s header to be set", request_id.HeaderName)
	}

	var payload struct {
		OK bool `json:"ok"`
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !payload.OK {
		t.Fatalf("expected ok=true, got false")
	}
}
