package router

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
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
	sort.Slice(filtered, func(i, j int) bool {
		if filtered[i].OrderIndex == filtered[j].OrderIndex {
			return filtered[i].ID < filtered[j].ID
		}
		return filtered[i].OrderIndex < filtered[j].OrderIndex
	})
	return filtered, nil
}

func (f *fakeNodeRepo) Update(_ context.Context, _ string, bookID int64, nodeID int64, parentID *int64, orderIndex int) (usecase.Node, error) {
	for i, node := range f.nodes {
		if node.ID == nodeID && node.BookID == bookID {
			f.nodes[i].ParentID = parentID
			f.nodes[i].OrderIndex = orderIndex
			return f.nodes[i], nil
		}
	}
	return usecase.Node{}, usecase.ErrNodeNotFound
}

func (f *fakeNodeRepo) Reorder(_ context.Context, _ string, bookID int64, parentID *int64, nodeIDs []int64) error {
	if len(nodeIDs) == 0 {
		return nil
	}

	seen := make(map[int64]struct{}, len(nodeIDs))
	for _, id := range nodeIDs {
		if _, exists := seen[id]; exists {
			return usecase.ErrInvalidNodeReorder
		}
		seen[id] = struct{}{}
	}

	idToNode := make(map[int64]*usecase.Node, len(f.nodes))
	for i := range f.nodes {
		node := &f.nodes[i]
		if node.BookID == bookID {
			idToNode[node.ID] = node
		}
	}
	if len(nodeIDs) != len(seen) {
		return usecase.ErrInvalidNodeReorder
	}
	for _, id := range nodeIDs {
		node, ok := idToNode[id]
		if !ok {
			return usecase.ErrInvalidNodeReorder
		}
		if parentID == nil {
			if node.ParentID != nil {
				return usecase.ErrInvalidNodeReorder
			}
		} else if node.ParentID == nil || *node.ParentID != *parentID {
			return usecase.ErrInvalidNodeReorder
		}
	}
	for index, id := range nodeIDs {
		node := idToNode[id]
		node.OrderIndex = index
	}
	return nil
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

func TestPatchNodeUpdatesParentAndOrderIndex(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookRepo := &fakeBookRepo{}
	nodeRepo := &fakeNodeRepo{}
	bookUsecase := usecase.NewBookUsecase(bookRepo)
	nodeUsecase := usecase.NewNodeUsecase(nodeRepo)
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase)

	bookBody, err := json.Marshal(map[string]string{"title": "Book"})
	if err != nil {
		t.Fatalf("marshal book payload: %v", err)
	}

	bookRequest := httptest.NewRequest(http.MethodPost, "/api/v1/books", bytes.NewReader(bookBody))
	bookResponse := httptest.NewRecorder()
	handler.ServeHTTP(bookResponse, bookRequest)

	if bookResponse.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, bookResponse.Code)
	}

	var createdBook struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(bookResponse.Body).Decode(&createdBook); err != nil {
		t.Fatalf("decode book response: %v", err)
	}

	parentPayload, err := json.Marshal(map[string]any{
		"parent_id":   nil,
		"order_index": 0,
		"title":       "Parent",
	})
	if err != nil {
		t.Fatalf("marshal parent payload: %v", err)
	}

	parentRequest := httptest.NewRequest(http.MethodPost, "/api/v1/books/"+strconv.FormatInt(createdBook.ID, 10)+"/nodes", bytes.NewReader(parentPayload))
	parentResponse := httptest.NewRecorder()
	handler.ServeHTTP(parentResponse, parentRequest)

	if parentResponse.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, parentResponse.Code)
	}

	var parentNode struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(parentResponse.Body).Decode(&parentNode); err != nil {
		t.Fatalf("decode parent response: %v", err)
	}

	childPayload, err := json.Marshal(map[string]any{
		"parent_id":   nil,
		"order_index": 1,
		"title":       "Child",
	})
	if err != nil {
		t.Fatalf("marshal child payload: %v", err)
	}

	childRequest := httptest.NewRequest(http.MethodPost, "/api/v1/books/"+strconv.FormatInt(createdBook.ID, 10)+"/nodes", bytes.NewReader(childPayload))
	childResponse := httptest.NewRecorder()
	handler.ServeHTTP(childResponse, childRequest)

	if childResponse.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, childResponse.Code)
	}

	var childNode struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(childResponse.Body).Decode(&childNode); err != nil {
		t.Fatalf("decode child response: %v", err)
	}

	updatePayload, err := json.Marshal(map[string]any{
		"parent_id":   parentNode.ID,
		"order_index": 2,
	})
	if err != nil {
		t.Fatalf("marshal update payload: %v", err)
	}

	updateRequest := httptest.NewRequest(http.MethodPatch, "/api/v1/books/"+strconv.FormatInt(createdBook.ID, 10)+"/nodes/"+strconv.FormatInt(childNode.ID, 10), bytes.NewReader(updatePayload))
	updateResponse := httptest.NewRecorder()
	handler.ServeHTTP(updateResponse, updateRequest)

	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, updateResponse.Code)
	}

	var updatedNode struct {
		ID         int64  `json:"id"`
		ParentID   *int64 `json:"parent_id"`
		OrderIndex int    `json:"order_index"`
	}
	if err := json.NewDecoder(updateResponse.Body).Decode(&updatedNode); err != nil {
		t.Fatalf("decode update response: %v", err)
	}
	if updatedNode.ParentID == nil || *updatedNode.ParentID != parentNode.ID {
		t.Fatalf("expected parent_id %d, got %v", parentNode.ID, updatedNode.ParentID)
	}
	if updatedNode.OrderIndex != 2 {
		t.Fatalf("expected order_index 2, got %d", updatedNode.OrderIndex)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/v1/books/"+strconv.FormatInt(createdBook.ID, 10)+"/nodes?parent_id="+strconv.FormatInt(parentNode.ID, 10), nil)
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, listRequest)

	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listResponse.Code)
	}

	var listNodes []struct {
		ID         int64 `json:"id"`
		OrderIndex int   `json:"order_index"`
	}
	if err := json.NewDecoder(listResponse.Body).Decode(&listNodes); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listNodes) != 1 {
		t.Fatalf("expected 1 node, got %d", len(listNodes))
	}
	if listNodes[0].ID != childNode.ID || listNodes[0].OrderIndex != 2 {
		t.Fatalf("expected updated child node, got %+v", listNodes[0])
	}
}

func TestReorderNodesUpdatesOrderIndex(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookRepo := &fakeBookRepo{}
	nodeRepo := &fakeNodeRepo{}
	bookUsecase := usecase.NewBookUsecase(bookRepo)
	nodeUsecase := usecase.NewNodeUsecase(nodeRepo)
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase)

	bookBody, err := json.Marshal(map[string]string{"title": "Book"})
	if err != nil {
		t.Fatalf("marshal book payload: %v", err)
	}

	bookRequest := httptest.NewRequest(http.MethodPost, "/api/v1/books", bytes.NewReader(bookBody))
	bookResponse := httptest.NewRecorder()
	handler.ServeHTTP(bookResponse, bookRequest)

	if bookResponse.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, bookResponse.Code)
	}

	var createdBook struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(bookResponse.Body).Decode(&createdBook); err != nil {
		t.Fatalf("decode book response: %v", err)
	}

	nodeIDs := make([]int64, 0, 3)
	for i := 0; i < 3; i++ {
		payload, err := json.Marshal(map[string]any{
			"parent_id":   nil,
			"order_index": i,
			"title":       "Node",
		})
		if err != nil {
			t.Fatalf("marshal node payload: %v", err)
		}
		request := httptest.NewRequest(http.MethodPost, "/api/v1/books/"+strconv.FormatInt(createdBook.ID, 10)+"/nodes", bytes.NewReader(payload))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusCreated {
			t.Fatalf("expected status %d, got %d", http.StatusCreated, response.Code)
		}
		var createdNode struct {
			ID int64 `json:"id"`
		}
		if err := json.NewDecoder(response.Body).Decode(&createdNode); err != nil {
			t.Fatalf("decode node response: %v", err)
		}
		nodeIDs = append(nodeIDs, createdNode.ID)
	}

	reorderPayload, err := json.Marshal(map[string]any{
		"parent_id": nil,
		"node_ids":  []int64{nodeIDs[2], nodeIDs[0], nodeIDs[1]},
	})
	if err != nil {
		t.Fatalf("marshal reorder payload: %v", err)
	}

	reorderRequest := httptest.NewRequest(http.MethodPut, "/api/v1/books/"+strconv.FormatInt(createdBook.ID, 10)+"/nodes/reorder", bytes.NewReader(reorderPayload))
	reorderResponse := httptest.NewRecorder()
	handler.ServeHTTP(reorderResponse, reorderRequest)

	if reorderResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, reorderResponse.Code)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/v1/books/"+strconv.FormatInt(createdBook.ID, 10)+"/nodes?parent_id=null", nil)
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, listRequest)

	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listResponse.Code)
	}

	var listNodes []struct {
		ID         int64 `json:"id"`
		OrderIndex int   `json:"order_index"`
	}
	if err := json.NewDecoder(listResponse.Body).Decode(&listNodes); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listNodes) != 3 {
		t.Fatalf("expected 3 nodes, got %d", len(listNodes))
	}
	expectedOrder := []int64{nodeIDs[2], nodeIDs[0], nodeIDs[1]}
	for i, node := range listNodes {
		if node.ID != expectedOrder[i] {
			t.Fatalf("expected node %d at index %d, got %d", expectedOrder[i], i, node.ID)
		}
		if node.OrderIndex != i {
			t.Fatalf("expected order_index %d, got %d", i, node.OrderIndex)
		}
	}
}
