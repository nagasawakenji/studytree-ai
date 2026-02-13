package repository

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

// ImportRepository persists import plans into existing tables.
type ImportRepository struct {
	pool *pgxpool.Pool
}

// NewImportRepository creates an ImportRepository.
func NewImportRepository(pool *pgxpool.Pool) *ImportRepository {
	return &ImportRepository{pool: pool}
}

// SaveImportPlan inserts book/nodes/summaries/problems in one transaction.
func (r *ImportRepository) SaveImportPlan(ctx context.Context, userID string, plan usecase.ImportPlan) (usecase.ImportResult, error) {
	if r.pool == nil {
		return usecase.ImportResult{}, errors.New("database not configured")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return usecase.ImportResult{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING", userID); err != nil {
		return usecase.ImportResult{}, err
	}

	var bookID int64
	if err := tx.QueryRow(ctx, "INSERT INTO books (user_id, title) VALUES ($1, $2) RETURNING id", userID, plan.Book.Title).Scan(&bookID); err != nil {
		return usecase.ImportResult{}, err
	}

	nodeIDByTmp := make(map[string]int64, len(plan.Nodes))
	remaining := append([]usecase.ImportPlanNode(nil), plan.Nodes...)
	for len(remaining) > 0 {
		progressed := false
		next := make([]usecase.ImportPlanNode, 0, len(remaining))
		for _, node := range remaining {
			var parentID *int64
			if node.ParentTmpID != nil {
				id, ok := nodeIDByTmp[*node.ParentTmpID]
				if !ok {
					next = append(next, node)
					continue
				}
				parentID = &id
			}

			var createdID int64
			if err := tx.QueryRow(ctx, `
				INSERT INTO nodes (user_id, book_id, parent_id, order_index, title)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING id
			`, userID, bookID, parentID, node.OrderIndex, node.Title).Scan(&createdID); err != nil {
				return usecase.ImportResult{}, err
			}
			nodeIDByTmp[node.TmpID] = createdID
			progressed = true
		}
		if !progressed {
			return usecase.ImportResult{}, errors.New("failed to resolve node parent references")
		}
		remaining = next
	}

	createdSummaries := 0
	for _, summary := range plan.Summaries {
		nodeID := nodeIDByTmp[summary.NodeTmpID]
		content := json.RawMessage(summary.Content)
		if _, err := tx.Exec(ctx, `
			INSERT INTO summaries (user_id, node_id, schema_ver, content)
			VALUES ($1, $2, $3, $4)
		`, userID, nodeID, summary.SchemaVer, content); err != nil {
			return usecase.ImportResult{}, err
		}
		createdSummaries++
	}

	createdProblems := 0
	for _, problem := range plan.Problems {
		nodeID := nodeIDByTmp[problem.NodeTmpID]
		content := json.RawMessage(problem.Content)
		if _, err := tx.Exec(ctx, `
			INSERT INTO problems (user_id, node_id, kind, schema_ver, content)
			VALUES ($1, $2, $3, $4, $5)
		`, userID, nodeID, problem.Kind, problem.SchemaVer, content); err != nil {
			return usecase.ImportResult{}, err
		}
		createdProblems++
	}

	if err := tx.Commit(ctx); err != nil {
		return usecase.ImportResult{}, err
	}

	return usecase.ImportResult{
		BookID: bookID,
		Created: usecase.ImportCreated{
			Nodes:     len(nodeIDByTmp),
			Problems:  createdProblems,
			Summaries: createdSummaries,
		},
	}, nil
}
