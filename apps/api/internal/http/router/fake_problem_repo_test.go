package router

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

type fakeProblemRepo struct {
	problems       []usecase.Problem
	idSeq          int64
	allowAllNodes  bool
	allowedNodeIDs map[int64]struct{}
}

func (f *fakeProblemRepo) AllowNode(id int64) {
	if f.allowedNodeIDs == nil {
		f.allowedNodeIDs = make(map[int64]struct{})
	}
	f.allowedNodeIDs[id] = struct{}{}
}

func (f *fakeProblemRepo) nodeAllowed(id int64) bool {
	if f.allowAllNodes {
		return true
	}
	_, ok := f.allowedNodeIDs[id]
	return ok
}

func (f *fakeProblemRepo) ListByNode(_ context.Context, _ string, nodeID int64) ([]usecase.Problem, error) {
	var filtered []usecase.Problem
	for _, problem := range f.problems {
		if problem.NodeID == nodeID {
			filtered = append(filtered, problem)
		}
	}
	sort.Slice(filtered, func(i, j int) bool {
		if filtered[i].CreatedAt.Equal(filtered[j].CreatedAt) {
			return filtered[i].ID > filtered[j].ID
		}
		return filtered[i].CreatedAt.After(filtered[j].CreatedAt)
	})
	return filtered, nil
}

func (f *fakeProblemRepo) GetByID(_ context.Context, _ string, problemID int64) (usecase.Problem, error) {
	for _, problem := range f.problems {
		if problem.ID == problemID {
			return problem, nil
		}
	}
	return usecase.Problem{}, usecase.ErrProblemNotFound
}

func (f *fakeProblemRepo) Create(_ context.Context, _ string, nodeID int64, kind string, schemaVer int, content json.RawMessage) (usecase.Problem, error) {
	if !f.nodeAllowed(nodeID) {
		return usecase.Problem{}, usecase.ErrNodeNotFound
	}
	f.idSeq++
	problem := usecase.Problem{
		ID:        f.idSeq,
		NodeID:    nodeID,
		Kind:      kind,
		SchemaVer: schemaVer,
		Content:   content,
		CreatedAt: time.Date(2024, 1, int(f.idSeq), 0, 0, 0, 0, time.UTC),
		UpdatedAt: time.Date(2024, 1, int(f.idSeq), 0, 0, 0, 0, time.UTC),
	}
	f.problems = append(f.problems, problem)
	return problem, nil
}
