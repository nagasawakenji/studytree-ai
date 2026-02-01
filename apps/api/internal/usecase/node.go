package usecase

import "context"

// Node represents a tree node in a book.
type Node struct {
	ID         int64
	BookID     int64
	ParentID   *int64
	OrderIndex int
	Title      string
}

// NodeRepository defines persistence for nodes.
type NodeRepository interface {
	Create(ctx context.Context, userID string, bookID int64, parentID *int64, orderIndex int, title string) (Node, error)
	List(ctx context.Context, userID string, bookID int64, parentID *int64) ([]Node, error)
}

// NodeUsecase handles node operations.
type NodeUsecase struct {
	repo NodeRepository
}

// NewNodeUsecase builds a NodeUsecase.
func NewNodeUsecase(repo NodeRepository) *NodeUsecase {
	return &NodeUsecase{repo: repo}
}

// Create registers a new node for the local user.
func (u *NodeUsecase) Create(ctx context.Context, bookID int64, parentID *int64, orderIndex int, title string) (Node, error) {
	return u.repo.Create(ctx, localUserID, bookID, parentID, orderIndex, title)
}

// List returns nodes for the local user.
func (u *NodeUsecase) List(ctx context.Context, bookID int64, parentID *int64) ([]Node, error) {
	return u.repo.List(ctx, localUserID, bookID, parentID)
}
