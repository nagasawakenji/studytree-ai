package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

var (
	// ErrProblemNotFound indicates the problem could not be located for the user.
	ErrProblemNotFound = errors.New("problem not found")
)

// Problem represents a learning problem attached to a node.
type Problem struct {
	ID        int64
	NodeID    int64
	Kind      string
	SchemaVer int
	Content   json.RawMessage
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ProblemRepository defines persistence for problems.
type ProblemRepository interface {
	ListByNode(ctx context.Context, userID string, nodeID int64) ([]Problem, error)
	GetByID(ctx context.Context, userID string, problemID int64) (Problem, error)
	Create(ctx context.Context, userID string, nodeID int64, kind string, schemaVer int, content json.RawMessage) (Problem, error)
}

// ProblemUsecase handles problem operations.
type ProblemUsecase struct {
	repo ProblemRepository
}

// NewProblemUsecase builds a ProblemUsecase.
func NewProblemUsecase(repo ProblemRepository) *ProblemUsecase {
	return &ProblemUsecase{repo: repo}
}

// ListByNode returns problems for the local user and node.
func (u *ProblemUsecase) ListByNode(ctx context.Context, nodeID int64) ([]Problem, error) {
	return u.repo.ListByNode(ctx, localUserID, nodeID)
}

// GetByID returns a single problem for the local user.
func (u *ProblemUsecase) GetByID(ctx context.Context, problemID int64) (Problem, error) {
	return u.repo.GetByID(ctx, localUserID, problemID)
}

// Create registers a new problem for the local user and node.
func (u *ProblemUsecase) Create(ctx context.Context, nodeID int64, kind string, schemaVer int, content json.RawMessage) (Problem, error) {
	return u.repo.Create(ctx, localUserID, nodeID, kind, schemaVer, content)
}
