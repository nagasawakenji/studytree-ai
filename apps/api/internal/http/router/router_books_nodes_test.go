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

func (f *fakeNodeRepo) MoveSubtree(_ context.Context, _ string, bookID int64, nodeID int64, dstBookID int64, dstParentID *int64, dstOrderIndex int) (usecase.Node, error) {
	var root *usecase.Node
	for i := range f.nodes {
		node := &f.nodes[i]
		if node.ID == nodeID && node.BookID == bookID {
			root = node
			break
		}
	}
	if root == nil {
		return usecase.Node{}, usecase.ErrNodeNotFound
	}

	if dstParentID != nil {
		var parentFound bool
		for i := range f.nodes {
			node := &f.nodes[i]
			if node.ID == *dstParentID && node.BookID == dstBookID {
				parentFound = true
				break
			}
		}
		if !parentFound {
			return usecase.Node{}, usecase.ErrInvalidMoveParent
		}
	}

	subtree := map[int64]struct{}{root.ID: {}}
	changed := true
	for changed {
		changed = false
		for i := range f.nodes {
			node := &f.nodes[i]
			if node.ParentID == nil {
				continue
			}
			if _, ok := subtree[*node.ParentID]; ok {
				if _, exists := subtree[node.ID]; !exists {
					subtree[node.ID] = struct{}{}
					changed = true
				}
			}
		}
	}

	for i := range f.nodes {
		node := &f.nodes[i]
		if _, ok := subtree[node.ID]; ok {
			node.BookID = dstBookID
		}
	}

	root.ParentID = dstParentID
	root.OrderIndex = dstOrderIndex
	root.BookID = dstBookID

	return *root, nil
}

func newProblemUsecaseForTests() *usecase.ProblemUsecase {
	return usecase.NewProblemUsecase(&fakeProblemRepo{allowAllNodes: true})
}

func TestBooksAndNodesRoutes(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookRepo := &fakeBookRepo{}
	nodeRepo := &fakeNodeRepo{}
	bookUsecase := usecase.NewBookUsecase(bookRepo)
	nodeUsecase := usecase.NewNodeUsecase(nodeRepo)
	problemUsecase := newProblemUsecaseForTests()
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase)

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
	problemUsecase := newProblemUsecaseForTests()
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase)

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
	problemUsecase := newProblemUsecaseForTests()
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase)

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

func TestMoveRootNodeToAnotherBook(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookRepo := &fakeBookRepo{}
	nodeRepo := &fakeNodeRepo{}
	bookUsecase := usecase.NewBookUsecase(bookRepo)
	nodeUsecase := usecase.NewNodeUsecase(nodeRepo)
	problemUsecase := newProblemUsecaseForTests()
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase)

	bookBody, err := json.Marshal(map[string]string{"title": "Book A"})
	if err != nil {
		t.Fatalf("marshal book payload: %v", err)
	}
	bookRequest := httptest.NewRequest(http.MethodPost, "/api/v1/books", bytes.NewReader(bookBody))
	bookResponse := httptest.NewRecorder()
	handler.ServeHTTP(bookResponse, bookRequest)
	if bookResponse.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, bookResponse.Code)
	}
	var bookA struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(bookResponse.Body).Decode(&bookA); err != nil {
		t.Fatalf("decode book response: %v", err)
	}

	bookBBody, err := json.Marshal(map[string]string{"title": "Book B"})
	if err != nil {
		t.Fatalf("marshal book payload: %v", err)
	}
	bookBRequest := httptest.NewRequest(http.MethodPost, "/api/v1/books", bytes.NewReader(bookBBody))
	bookBResponse := httptest.NewRecorder()
	handler.ServeHTTP(bookBResponse, bookBRequest)
	if bookBResponse.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, bookBResponse.Code)
	}
	var bookB struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(bookBResponse.Body).Decode(&bookB); err != nil {
		t.Fatalf("decode book response: %v", err)
	}

	rootPayload, err := json.Marshal(map[string]any{
		"parent_id":   nil,
		"order_index": 0,
		"title":       "Root",
	})
	if err != nil {
		t.Fatalf("marshal root payload: %v", err)
	}
	rootRequest := httptest.NewRequest(http.MethodPost, "/api/v1/books/"+strconv.FormatInt(bookA.ID, 10)+"/nodes", bytes.NewReader(rootPayload))
	rootResponse := httptest.NewRecorder()
	handler.ServeHTTP(rootResponse, rootRequest)
	if rootResponse.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, rootResponse.Code)
	}
	var rootNode struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(rootResponse.Body).Decode(&rootNode); err != nil {
		t.Fatalf("decode root node response: %v", err)
	}

	childPayload, err := json.Marshal(map[string]any{
		"parent_id":   rootNode.ID,
		"order_index": 0,
		"title":       "Child",
	})
	if err != nil {
		t.Fatalf("marshal child payload: %v", err)
	}
	childRequest := httptest.NewRequest(http.MethodPost, "/api/v1/books/"+strconv.FormatInt(bookA.ID, 10)+"/nodes", bytes.NewReader(childPayload))
	childResponse := httptest.NewRecorder()
	handler.ServeHTTP(childResponse, childRequest)
	if childResponse.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, childResponse.Code)
	}
	var childNode struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(childResponse.Body).Decode(&childNode); err != nil {
		t.Fatalf("decode child node response: %v", err)
	}

	movePayload, err := json.Marshal(map[string]any{
		"dst_book_id":     bookB.ID,
		"dst_parent_id":   nil,
		"dst_order_index": 1,
	})
	if err != nil {
		t.Fatalf("marshal move payload: %v", err)
	}
	moveRequest := httptest.NewRequest(http.MethodPatch, "/api/v1/books/"+strconv.FormatInt(bookA.ID, 10)+"/nodes/"+strconv.FormatInt(rootNode.ID, 10)+"/move", bytes.NewReader(movePayload))
	moveResponse := httptest.NewRecorder()
	handler.ServeHTTP(moveResponse, moveRequest)
	if moveResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, moveResponse.Code)
	}

	listRootRequest := httptest.NewRequest(http.MethodGet, "/api/v1/books/"+strconv.FormatInt(bookB.ID, 10)+"/nodes?parent_id=null", nil)
	listRootResponse := httptest.NewRecorder()
	handler.ServeHTTP(listRootResponse, listRootRequest)
	if listRootResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listRootResponse.Code)
	}
	var rootList []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(listRootResponse.Body).Decode(&rootList); err != nil {
		t.Fatalf("decode root list response: %v", err)
	}
	if len(rootList) != 1 || rootList[0].ID != rootNode.ID {
		t.Fatalf("expected moved root node, got %+v", rootList)
	}

	listChildRequest := httptest.NewRequest(http.MethodGet, "/api/v1/books/"+strconv.FormatInt(bookB.ID, 10)+"/nodes?parent_id="+strconv.FormatInt(rootNode.ID, 10), nil)
	listChildResponse := httptest.NewRecorder()
	handler.ServeHTTP(listChildResponse, listChildRequest)
	if listChildResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listChildResponse.Code)
	}
	var childList []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(listChildResponse.Body).Decode(&childList); err != nil {
		t.Fatalf("decode child list response: %v", err)
	}
	if len(childList) != 1 || childList[0].ID != childNode.ID {
		t.Fatalf("expected moved child node, got %+v", childList)
	}
}

func TestMoveNodeUnderDestinationParent(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookRepo := &fakeBookRepo{}
	nodeRepo := &fakeNodeRepo{}
	bookUsecase := usecase.NewBookUsecase(bookRepo)
	nodeUsecase := usecase.NewNodeUsecase(nodeRepo)
	problemUsecase := newProblemUsecaseForTests()
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase)

	createBook := func(title string) int64 {
		body, err := json.Marshal(map[string]string{"title": title})
		if err != nil {
			t.Fatalf("marshal book payload: %v", err)
		}
		request := httptest.NewRequest(http.MethodPost, "/api/v1/books", bytes.NewReader(body))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusCreated {
			t.Fatalf("expected status %d, got %d", http.StatusCreated, response.Code)
		}
		var book struct {
			ID int64 `json:"id"`
		}
		if err := json.NewDecoder(response.Body).Decode(&book); err != nil {
			t.Fatalf("decode book response: %v", err)
		}
		return book.ID
	}

	bookAID := createBook("Book A")
	bookBID := createBook("Book B")

	createNode := func(bookID int64, parentID *int64, orderIndex int, title string) int64 {
		payload, err := json.Marshal(map[string]any{
			"parent_id":   parentID,
			"order_index": orderIndex,
			"title":       title,
		})
		if err != nil {
			t.Fatalf("marshal node payload: %v", err)
		}
		request := httptest.NewRequest(http.MethodPost, "/api/v1/books/"+strconv.FormatInt(bookID, 10)+"/nodes", bytes.NewReader(payload))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusCreated {
			t.Fatalf("expected status %d, got %d", http.StatusCreated, response.Code)
		}
		var node struct {
			ID int64 `json:"id"`
		}
		if err := json.NewDecoder(response.Body).Decode(&node); err != nil {
			t.Fatalf("decode node response: %v", err)
		}
		return node.ID
	}

	rootAID := createNode(bookAID, nil, 0, "Root A")
	childAID := createNode(bookAID, &rootAID, 0, "Child A")
	grandchildID := createNode(bookAID, &childAID, 0, "Grandchild A")
	rootBID := createNode(bookBID, nil, 0, "Root B")

	movePayload, err := json.Marshal(map[string]any{
		"dst_book_id":     bookBID,
		"dst_parent_id":   rootBID,
		"dst_order_index": 2,
	})
	if err != nil {
		t.Fatalf("marshal move payload: %v", err)
	}
	moveRequest := httptest.NewRequest(http.MethodPatch, "/api/v1/books/"+strconv.FormatInt(bookAID, 10)+"/nodes/"+strconv.FormatInt(childAID, 10)+"/move", bytes.NewReader(movePayload))
	moveResponse := httptest.NewRecorder()
	handler.ServeHTTP(moveResponse, moveRequest)
	if moveResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, moveResponse.Code)
	}

	listMovedRequest := httptest.NewRequest(http.MethodGet, "/api/v1/books/"+strconv.FormatInt(bookBID, 10)+"/nodes?parent_id="+strconv.FormatInt(rootBID, 10), nil)
	listMovedResponse := httptest.NewRecorder()
	handler.ServeHTTP(listMovedResponse, listMovedRequest)
	if listMovedResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listMovedResponse.Code)
	}
	var movedList []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(listMovedResponse.Body).Decode(&movedList); err != nil {
		t.Fatalf("decode moved list response: %v", err)
	}
	if len(movedList) != 1 || movedList[0].ID != childAID {
		t.Fatalf("expected moved child node, got %+v", movedList)
	}

	listGrandchildRequest := httptest.NewRequest(http.MethodGet, "/api/v1/books/"+strconv.FormatInt(bookBID, 10)+"/nodes?parent_id="+strconv.FormatInt(childAID, 10), nil)
	listGrandchildResponse := httptest.NewRecorder()
	handler.ServeHTTP(listGrandchildResponse, listGrandchildRequest)
	if listGrandchildResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listGrandchildResponse.Code)
	}
	var grandchildList []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(listGrandchildResponse.Body).Decode(&grandchildList); err != nil {
		t.Fatalf("decode grandchild list response: %v", err)
	}
	if len(grandchildList) != 1 || grandchildList[0].ID != grandchildID {
		t.Fatalf("expected moved grandchild node, got %+v", grandchildList)
	}
}

func TestMoveNodeMovesDescendants(t *testing.T) {
	log := logger.NewJSONLogger(io.Discard)
	bookRepo := &fakeBookRepo{}
	nodeRepo := &fakeNodeRepo{}
	bookUsecase := usecase.NewBookUsecase(bookRepo)
	nodeUsecase := usecase.NewNodeUsecase(nodeRepo)
	problemUsecase := newProblemUsecaseForTests()
	handler := NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase)

	bookBody, err := json.Marshal(map[string]string{"title": "Source"})
	if err != nil {
		t.Fatalf("marshal book payload: %v", err)
	}
	bookRequest := httptest.NewRequest(http.MethodPost, "/api/v1/books", bytes.NewReader(bookBody))
	bookResponse := httptest.NewRecorder()
	handler.ServeHTTP(bookResponse, bookRequest)
	if bookResponse.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, bookResponse.Code)
	}
	var sourceBook struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(bookResponse.Body).Decode(&sourceBook); err != nil {
		t.Fatalf("decode book response: %v", err)
	}

	destBody, err := json.Marshal(map[string]string{"title": "Dest"})
	if err != nil {
		t.Fatalf("marshal book payload: %v", err)
	}
	destRequest := httptest.NewRequest(http.MethodPost, "/api/v1/books", bytes.NewReader(destBody))
	destResponse := httptest.NewRecorder()
	handler.ServeHTTP(destResponse, destRequest)
	if destResponse.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, destResponse.Code)
	}
	var destBook struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(destResponse.Body).Decode(&destBook); err != nil {
		t.Fatalf("decode book response: %v", err)
	}

	rootID := func() int64 {
		payload, err := json.Marshal(map[string]any{
			"parent_id":   nil,
			"order_index": 0,
			"title":       "Root",
		})
		if err != nil {
			t.Fatalf("marshal node payload: %v", err)
		}
		request := httptest.NewRequest(http.MethodPost, "/api/v1/books/"+strconv.FormatInt(sourceBook.ID, 10)+"/nodes", bytes.NewReader(payload))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusCreated {
			t.Fatalf("expected status %d, got %d", http.StatusCreated, response.Code)
		}
		var node struct {
			ID int64 `json:"id"`
		}
		if err := json.NewDecoder(response.Body).Decode(&node); err != nil {
			t.Fatalf("decode node response: %v", err)
		}
		return node.ID
	}()

	childID := func(parentID int64, title string) int64 {
		payload, err := json.Marshal(map[string]any{
			"parent_id":   parentID,
			"order_index": 0,
			"title":       title,
		})
		if err != nil {
			t.Fatalf("marshal node payload: %v", err)
		}
		request := httptest.NewRequest(http.MethodPost, "/api/v1/books/"+strconv.FormatInt(sourceBook.ID, 10)+"/nodes", bytes.NewReader(payload))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusCreated {
			t.Fatalf("expected status %d, got %d", http.StatusCreated, response.Code)
		}
		var node struct {
			ID int64 `json:"id"`
		}
		if err := json.NewDecoder(response.Body).Decode(&node); err != nil {
			t.Fatalf("decode node response: %v", err)
		}
		return node.ID
	}

	childAID := childID(rootID, "Child A")
	childBID := childID(childAID, "Child B")

	movePayload, err := json.Marshal(map[string]any{
		"dst_book_id":     destBook.ID,
		"dst_parent_id":   nil,
		"dst_order_index": 0,
	})
	if err != nil {
		t.Fatalf("marshal move payload: %v", err)
	}
	moveRequest := httptest.NewRequest(http.MethodPatch, "/api/v1/books/"+strconv.FormatInt(sourceBook.ID, 10)+"/nodes/"+strconv.FormatInt(rootID, 10)+"/move", bytes.NewReader(movePayload))
	moveResponse := httptest.NewRecorder()
	handler.ServeHTTP(moveResponse, moveRequest)
	if moveResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, moveResponse.Code)
	}

	listChildRequest := httptest.NewRequest(http.MethodGet, "/api/v1/books/"+strconv.FormatInt(destBook.ID, 10)+"/nodes?parent_id="+strconv.FormatInt(rootID, 10), nil)
	listChildResponse := httptest.NewRecorder()
	handler.ServeHTTP(listChildResponse, listChildRequest)
	if listChildResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listChildResponse.Code)
	}
	var childList []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(listChildResponse.Body).Decode(&childList); err != nil {
		t.Fatalf("decode child list response: %v", err)
	}
	if len(childList) != 1 || childList[0].ID != childAID {
		t.Fatalf("expected moved child node, got %+v", childList)
	}

	listGrandchildRequest := httptest.NewRequest(http.MethodGet, "/api/v1/books/"+strconv.FormatInt(destBook.ID, 10)+"/nodes?parent_id="+strconv.FormatInt(childAID, 10), nil)
	listGrandchildResponse := httptest.NewRecorder()
	handler.ServeHTTP(listGrandchildResponse, listGrandchildRequest)
	if listGrandchildResponse.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listGrandchildResponse.Code)
	}
	var grandchildList []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(listGrandchildResponse.Body).Decode(&grandchildList); err != nil {
		t.Fatalf("decode grandchild list response: %v", err)
	}
	if len(grandchildList) != 1 || grandchildList[0].ID != childBID {
		t.Fatalf("expected moved grandchild node, got %+v", grandchildList)
	}
}
