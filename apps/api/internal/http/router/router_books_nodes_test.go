package router

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

type fakeBookRepo struct {
	books []usecase.Book
	idSeq int64
}

func (f *fakeBookRepo) Create(_ context.Context, _ string, title string) (usecase.Book, error) {
	f.idSeq++
	book := usecase.Book{
		ID:        f.idSeq,
		Title:     title,
		CreatedAt: time.Date(2024, 1, int(f.idSeq), 0, 0, 0, 0, time.UTC),
	}
	f.books = append(f.books, book)
	return book, nil
}

func (f *fakeBookRepo) List(_ context.Context, _ string) ([]usecase.Book, error) {
	return append([]usecase.Book(nil), f.books...), nil
}

type fakeNodeRepo struct {
	nodes []usecase.Node
	idSeq int64
}

func (f *fakeNodeRepo) Create(_ context.Context, _ string, bookID int64, parentID *int64, orderIndex int, title string) (usecase.Node, error) {
	f.idSeq++
	node := usecase.Node{
		ID:         f.idSeq,
		BookID:     bookID,
		ParentID:   parentID,
		OrderIndex: orderIndex,
		Title:      title,
	}
	f.nodes = append(f.nodes, node)
	return node, nil
}

func (f *fakeNodeRepo) List(_ context.Context, _ string, bookID int64, parentID *int64) ([]usecase.Node, error) {
	var filtered []usecase.Node
	for _, node := range f.nodes {
		if node.BookID != bookID {
			continue
		}
		if parentID == nil && node.ParentID != nil {
			continue
		}
		if parentID != nil {
			if node.ParentID == nil || *node.ParentID != *parentID {
				continue
			}
		}
		filtered = append(filtered, node)
	}
	return filtered, nil
}

func TestBooksAndNodesRoutes(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookRepo := &fakeBookRepo{}
	nodeRepo := &fakeNodeRepo{}
	bookUsecase := usecase.NewBookUsecase(bookRepo)
	nodeUsecase := usecase.NewNodeUsecase(nodeRepo)
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase)

	payload := map[string]string{"title": "My Book"}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/v1/books", bytes.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, response.Code)
	}

	var createdBook struct {
		ID    int64  `json:"id"`
		Title string `json:"title"`
	}
	if err := json.NewDecoder(response.Body).Decode(&createdBook); err != nil {
		t.Fatalf("decode create book response: %v", err)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/v1/books", nil)
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, listRequest)

	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listResponse.Code)
	}

	var listBooks []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(listResponse.Body).Decode(&listBooks); err != nil {
		t.Fatalf("decode list books response: %v", err)
	}
	if len(listBooks) != 1 {
		t.Fatalf("expected 1 book, got %d", len(listBooks))
	}

	nodePayload := map[string]any{
		"parent_id":   nil,
		"order_index": 1,
		"title":       "Root Node",
	}
	nodeBody, err := json.Marshal(nodePayload)
	if err != nil {
		t.Fatalf("marshal node payload: %v", err)
	}

	nodeRequest := httptest.NewRequest(http.MethodPost, "/api/v1/books/"+strconv.FormatInt(createdBook.ID, 10)+"/nodes", bytes.NewReader(nodeBody))
	nodeResponse := httptest.NewRecorder()
	handler.ServeHTTP(nodeResponse, nodeRequest)

	if nodeResponse.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, nodeResponse.Code)
	}

	var createdNode struct {
		ID       int64  `json:"id"`
		BookID   int64  `json:"book_id"`
		Title    string `json:"title"`
		ParentID *int64 `json:"parent_id"`
	}
	if err := json.NewDecoder(nodeResponse.Body).Decode(&createdNode); err != nil {
		t.Fatalf("decode create node response: %v", err)
	}
	if createdNode.BookID != createdBook.ID {
		t.Fatalf("expected book_id %d, got %d", createdBook.ID, createdNode.BookID)
	}

	listNodesRequest := httptest.NewRequest(http.MethodGet, "/api/v1/books/"+strconv.FormatInt(createdBook.ID, 10)+"/nodes?parent_id=null", nil)
	listNodesResponse := httptest.NewRecorder()
	handler.ServeHTTP(listNodesResponse, listNodesRequest)

	if listNodesResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listNodesResponse.Code)
	}

	var listNodes []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(listNodesResponse.Body).Decode(&listNodes); err != nil {
		t.Fatalf("decode list nodes response: %v", err)
	}
	if len(listNodes) != 1 {
		t.Fatalf("expected 1 node, got %d", len(listNodes))
	}
}

func TestNewRouterAcceptsPool(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	var pool *pgxpool.Pool
	if NewRouter(log, pool) == nil {
		t.Fatalf("expected router to be initialized")
	}
}
