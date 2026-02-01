package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

// NodeRepository persists nodes in Postgres.
type NodeRepository struct {
	pool *pgxpool.Pool
}

// NewNodeRepository creates a new NodeRepository.
func NewNodeRepository(pool *pgxpool.Pool) *NodeRepository {
	return &NodeRepository{pool: pool}
}

// Create inserts a node for a user and book.
func (r *NodeRepository) Create(ctx context.Context, userID string, bookID int64, parentID *int64, orderIndex int, title string) (usecase.Node, error) {
	if r.pool == nil {
		return usecase.Node{}, errors.New("database not configured")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return usecase.Node{}, err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, "INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING", userID)
	if err != nil {
		return usecase.Node{}, err
	}

	var node usecase.Node
	row := tx.QueryRow(ctx, `
		INSERT INTO nodes (user_id, book_id, parent_id, order_index, title)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, book_id, parent_id, order_index, title
	`, userID, bookID, parentID, orderIndex, title)

	var parent pgtype.Int8
	if err := row.Scan(&node.ID, &node.BookID, &parent, &node.OrderIndex, &node.Title); err != nil {
		return usecase.Node{}, err
	}
	if parent.Valid {
		node.ParentID = &parent.Int64
	}

	if err := tx.Commit(ctx); err != nil {
		return usecase.Node{}, err
	}

	return node, nil
}

// List returns nodes for a user and book, optionally filtered by parent.
func (r *NodeRepository) List(ctx context.Context, userID string, bookID int64, parentID *int64) ([]usecase.Node, error) {
	if r.pool == nil {
		return nil, errors.New("database not configured")
	}

	var rows pgx.Rows
	var err error
	if parentID == nil {
		rows, err = r.pool.Query(ctx, `
			SELECT id, book_id, parent_id, order_index, title
			FROM nodes
			WHERE user_id = $1 AND book_id = $2 AND parent_id IS NULL
			ORDER BY order_index ASC, id ASC
		`, userID, bookID)
	} else {
		rows, err = r.pool.Query(ctx, `
			SELECT id, book_id, parent_id, order_index, title
			FROM nodes
			WHERE user_id = $1 AND book_id = $2 AND parent_id = $3
			ORDER BY order_index ASC, id ASC
		`, userID, bookID, *parentID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []usecase.Node
	for rows.Next() {
		var node usecase.Node
		var parent pgtype.Int8
		if err := rows.Scan(&node.ID, &node.BookID, &parent, &node.OrderIndex, &node.Title); err != nil {
			return nil, err
		}
		if parent.Valid {
			value := parent.Int64
			node.ParentID = &value
		}
		nodes = append(nodes, node)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return nodes, nil
}
