package router

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

func TestCreateAndListProblems(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookUsecase := usecase.NewBookUsecase(&fakeBookRepo{})
	nodeUsecase := usecase.NewNodeUsecase(&fakeNodeRepo{})
	problemUsecase := usecase.NewProblemUsecase(&fakeProblemRepo{allowAllNodes: true})
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase)

	payload := map[string]any{
		"kind": "qa",
		"content": map[string]string{
			"title":     "Test",
			"body_md":   "Q: ...",
			"answer_md": "A: ...",
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/v1/nodes/1/problems", bytes.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, response.Code)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/v1/nodes/1/problems", nil)
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, listRequest)

	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listResponse.Code)
	}

	var items []struct {
		ID     int64 `json:"id"`
		NodeID int64 `json:"node_id"`
	}
	if err := json.NewDecoder(listResponse.Body).Decode(&items); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 problem, got %d", len(items))
	}
	if items[0].NodeID != 1 {
		t.Fatalf("expected node_id 1, got %d", items[0].NodeID)
	}
}

func TestCreateProblemMissingNodeReturnsNotFound(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookUsecase := usecase.NewBookUsecase(&fakeBookRepo{})
	nodeUsecase := usecase.NewNodeUsecase(&fakeNodeRepo{})
	problemUsecase := usecase.NewProblemUsecase(&fakeProblemRepo{})
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase)

	payload := map[string]any{
		"kind": "qa",
		"content": map[string]string{
			"title": "Missing node",
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/v1/nodes/999/problems", bytes.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, response.Code)
	}
}

func TestCreateProblemRejectsBadJSON(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookUsecase := usecase.NewBookUsecase(&fakeBookRepo{})
	nodeUsecase := usecase.NewNodeUsecase(&fakeNodeRepo{})
	problemUsecase := usecase.NewProblemUsecase(&fakeProblemRepo{allowAllNodes: true})
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase)

	request := httptest.NewRequest(http.MethodPost, "/api/v1/nodes/1/problems", bytes.NewBufferString("{bad json"))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, response.Code)
	}
}
