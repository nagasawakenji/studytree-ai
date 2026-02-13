package router

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

type fakeImportPlanner struct {
	plan usecase.ImportPlan
	err  error
}

func (f *fakeImportPlanner) GenerateImportPlan(_ context.Context, _ usecase.ImportRequest) (usecase.ImportPlan, error) {
	if f.err != nil {
		return usecase.ImportPlan{}, f.err
	}
	return f.plan, nil
}

type fakeImportRepo struct {
	result       usecase.ImportResult
	deriveCounts bool
}

func (f *fakeImportRepo) SaveImportPlan(_ context.Context, _ string, plan usecase.ImportPlan) (usecase.ImportResult, error) {
	if f.deriveCounts {
		return usecase.ImportResult{
			BookID: f.result.BookID,
			Created: usecase.ImportCreated{
				Books:     1,
				Nodes:     len(plan.Nodes),
				Summaries: len(plan.Summaries),
				Problems:  len(plan.Problems),
			},
		}, nil
	}
	return f.result, nil
}

func TestImportChatGPTRoute(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookUsecase := usecase.NewBookUsecase(&fakeBookRepo{})
	nodeUsecase := usecase.NewNodeUsecase(&fakeNodeRepo{})
	problemUsecase := usecase.NewProblemUsecase(&fakeProblemRepo{allowAllNodes: true})
	importUsecase := usecase.NewImportUsecase(
		&fakeImportRepo{
			result: usecase.ImportResult{
				BookID: 42,
				Created: usecase.ImportCreated{
					Books:     1,
					Nodes:     2,
					Problems:  1,
					Summaries: 1,
				},
			},
		},
		&fakeImportPlanner{
			plan: usecase.ImportPlan{
				Book: usecase.ImportPlanBook{Title: "Linear Algebra"},
				Nodes: []usecase.ImportPlanNode{
					{TmpID: "ch1", Title: "Chapter 1", OrderIndex: 0},
					{TmpID: "sec1", ParentTmpID: ptr("ch1"), Title: "Section 1", OrderIndex: 0},
				},
				Summaries: []usecase.ImportPlanSummary{
					{NodeTmpID: "ch1", SchemaVer: 1, Content: json.RawMessage(`{"v":1,"sc":"scope"}`)},
				},
				Problems: []usecase.ImportPlanProblem{
					{NodeTmpID: "sec1", Kind: "qa", SchemaVer: 1, Content: json.RawMessage(`{"title":"q1","stem":"s1"}`)},
				},
			},
		},
	)

	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase, importUsecase)
	body := []byte(`{"book_title":"線形代数","source_text":"章構成","options":{"max_depth":3,"problems_per_leaf":3,"language":"ja"}}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/imports/chatgpt", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	var resp struct {
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
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.BookID != 42 {
		t.Fatalf("expected book_id 42, got %d", resp.BookID)
	}
	if resp.RequestID == "" {
		t.Fatal("expected request_id in response")
	}
	if resp.CreatedCounts.Books != 1 || resp.CreatedCounts.Nodes != 2 || resp.CreatedCounts.Problems != 1 || resp.CreatedCounts.Summaries != 1 {
		t.Fatalf("unexpected created counts: %+v", resp.CreatedCounts)
	}
	if resp.FilteredCounts.SummariesInvalid != 0 || resp.FilteredCounts.ProblemsInvalid != 0 {
		t.Fatalf("unexpected filtered counts: %+v", resp.FilteredCounts)
	}
}

func TestImportChatGPTRouteRejectsInvalidParent(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookUsecase := usecase.NewBookUsecase(&fakeBookRepo{})
	nodeUsecase := usecase.NewNodeUsecase(&fakeNodeRepo{})
	problemUsecase := usecase.NewProblemUsecase(&fakeProblemRepo{allowAllNodes: true})
	importUsecase := usecase.NewImportUsecase(
		&fakeImportRepo{},
		&fakeImportPlanner{
			plan: usecase.ImportPlan{
				Book: usecase.ImportPlanBook{Title: "Linear Algebra"},
				Nodes: []usecase.ImportPlanNode{
					{TmpID: "ch1", ParentTmpID: ptr("missing"), Title: "Chapter 1", OrderIndex: 0},
				},
			},
		},
	)

	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase, importUsecase)
	body := []byte(`{"book_title":"線形代数","source_text":"章構成"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/imports/chatgpt", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}
}

func TestImportChatGPTRouteReturnsFilteredCounts(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookUsecase := usecase.NewBookUsecase(&fakeBookRepo{})
	nodeUsecase := usecase.NewNodeUsecase(&fakeNodeRepo{})
	problemUsecase := usecase.NewProblemUsecase(&fakeProblemRepo{allowAllNodes: true})
	importUsecase := usecase.NewImportUsecase(
		&fakeImportRepo{
			result:       usecase.ImportResult{BookID: 123},
			deriveCounts: true,
		},
		&fakeImportPlanner{
			plan: usecase.ImportPlan{
				Book: usecase.ImportPlanBook{Title: "Linear Algebra"},
				Nodes: []usecase.ImportPlanNode{
					{TmpID: "ch1", Title: "Chapter 1", OrderIndex: 0},
					{TmpID: "sec1", ParentTmpID: ptr("ch1"), Title: "Section 1", OrderIndex: 0},
				},
				Summaries: []usecase.ImportPlanSummary{
					{NodeTmpID: "ch1", SchemaVer: 1, Content: json.RawMessage(`{"v":1,"sc":"scope"}`)},
					{NodeTmpID: "sec1", SchemaVer: 1, Content: json.RawMessage(`{"v":1}`)},
				},
				Problems: []usecase.ImportPlanProblem{
					{NodeTmpID: "sec1", Kind: "qa", SchemaVer: 1, Content: json.RawMessage(`{"title":"q1","stem":"s1"}`)},
					{NodeTmpID: "sec1", Kind: "qa", SchemaVer: 1, Content: json.RawMessage(`{"title":"q2"}`)},
				},
			},
		},
	)

	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase, importUsecase)
	body := []byte(`{"book_title":"線形代数","source_text":"章構成"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/imports/chatgpt", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	var resp struct {
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
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.CreatedCounts.Books != 1 || resp.CreatedCounts.Nodes != 2 || resp.CreatedCounts.Summaries != 1 || resp.CreatedCounts.Problems != 1 {
		t.Fatalf("unexpected created counts: %+v", resp.CreatedCounts)
	}
	if resp.FilteredCounts.SummariesInvalid != 1 || resp.FilteredCounts.ProblemsInvalid != 1 {
		t.Fatalf("unexpected filtered counts: %+v", resp.FilteredCounts)
	}
}

func TestImportChatGPTRouteInvalidJSONFromLLM(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookUsecase := usecase.NewBookUsecase(&fakeBookRepo{})
	nodeUsecase := usecase.NewNodeUsecase(&fakeNodeRepo{})
	problemUsecase := usecase.NewProblemUsecase(&fakeProblemRepo{allowAllNodes: true})
	importUsecase := usecase.NewImportUsecase(
		&fakeImportRepo{},
		&fakeImportPlanner{
			err: fmt.Errorf("%w: %v", usecase.ErrImportInvalidJSONFromLLM, errors.New("unexpected end of JSON input")),
		},
	)

	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase, importUsecase)
	body := []byte(`{"book_title":"線形代数","source_text":"章構成"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/imports/chatgpt", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected status %d, got %d", http.StatusBadGateway, rec.Code)
	}

	var resp struct {
		Error     string `json:"error"`
		Reason    string `json:"reason"`
		RequestID string `json:"request_id"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error == "" {
		t.Fatal("expected error message")
	}
	if resp.Reason != "invalid_json_from_llm" {
		t.Fatalf("expected reason invalid_json_from_llm, got %s", resp.Reason)
	}
	if resp.RequestID == "" {
		t.Fatal("expected request_id in error response")
	}
}

func ptr(v string) *string {
	return &v
}
