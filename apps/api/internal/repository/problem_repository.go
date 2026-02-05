package repository

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

// ProblemRepository persists problems in Postgres.
type ProblemRepository struct {
	pool *pgxpool.Pool
}

// NewProblemRepository creates a new ProblemRepository.
func NewProblemRepository(pool *pgxpool.Pool) *ProblemRepository {
	return &ProblemRepository{pool: pool}
}

// ListByNode returns problems for a user and node.
func (r *ProblemRepository) ListByNode(ctx context.Context, userID string, nodeID int64) ([]usecase.Problem, error) {
	if r.pool == nil {
		return nil, errors.New("database not configured")
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, node_id, kind, schema_ver, content, created_at, updated_at
		FROM problems
		WHERE user_id = $1 AND node_id = $2
		ORDER BY created_at DESC, id DESC
	`, userID, nodeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var problems []usecase.Problem
	for rows.Next() {
		var problem usecase.Problem
		var content json.RawMessage
		if err := rows.Scan(&problem.ID, &problem.NodeID, &problem.Kind, &problem.SchemaVer, &content, &problem.CreatedAt, &problem.UpdatedAt); err != nil {
			return nil, err
		}
		problem.Content = content
		problems = append(problems, problem)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return problems, nil
}

// Create inserts a problem for a user and node.
func (r *ProblemRepository) Create(ctx context.Context, userID string, nodeID int64, kind string, schemaVer int, content json.RawMessage) (usecase.Problem, error) {
	if r.pool == nil {
		return usecase.Problem{}, errors.New("database not configured")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return usecase.Problem{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING", userID); err != nil {
		return usecase.Problem{}, err
	}

	var problem usecase.Problem
	row := tx.QueryRow(ctx, `
		INSERT INTO problems (user_id, node_id, kind, schema_ver, content)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, node_id, kind, schema_ver, content, created_at, updated_at
	`, userID, nodeID, kind, schemaVer, content)

	var storedContent json.RawMessage
	if err := row.Scan(&problem.ID, &problem.NodeID, &problem.Kind, &problem.SchemaVer, &storedContent, &problem.CreatedAt, &problem.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return usecase.Problem{}, err
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return usecase.Problem{}, usecase.ErrNodeNotFound
		}
		return usecase.Problem{}, err
	}
	problem.Content = storedContent

	if err := tx.Commit(ctx); err != nil {
		return usecase.Problem{}, err
	}

	return problem, nil
}
