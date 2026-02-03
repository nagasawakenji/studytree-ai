package usecase

import (
	"context"
	"errors"
)

var (
	// ErrNodeNotFound indicates the node could not be located for the given book.
	ErrNodeNotFound = errors.New("node not found")
	// ErrInvalidNodeReorder indicates node_ids do not align with the specified parent/book.
	ErrInvalidNodeReorder = errors.New("invalid node reorder")
)

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
	Update(ctx context.Context, userID string, bookID int64, nodeID int64, parentID *int64, orderIndex int) (Node, error)
	Reorder(ctx context.Context, userID string, bookID int64, parentID *int64, nodeIDs []int64) error
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

// Update changes the parent/order information for a node.
func (u *NodeUsecase) Update(ctx context.Context, bookID int64, nodeID int64, parentID *int64, orderIndex int) (Node, error) {
	return u.repo.Update(ctx, localUserID, bookID, nodeID, parentID, orderIndex)
}

// Reorder updates order_index for nodes under the parent.
func (u *NodeUsecase) Reorder(ctx context.Context, bookID int64, parentID *int64, nodeIDs []int64) error {
	return u.repo.Reorder(ctx, localUserID, bookID, parentID, nodeIDs)
}
