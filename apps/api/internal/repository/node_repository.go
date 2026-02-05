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

// Update modifies parent_id/order_index for a node.
func (r *NodeRepository) Update(ctx context.Context, userID string, bookID int64, nodeID int64, parentID *int64, orderIndex int) (usecase.Node, error) {
	if r.pool == nil {
		return usecase.Node{}, errors.New("database not configured")
	}

	var node usecase.Node
	row := r.pool.QueryRow(ctx, `
		UPDATE nodes
		SET parent_id = $1, order_index = $2
		WHERE user_id = $3 AND book_id = $4 AND id = $5
		RETURNING id, book_id, parent_id, order_index, title
	`, parentID, orderIndex, userID, bookID, nodeID)

	var parent pgtype.Int8
	if err := row.Scan(&node.ID, &node.BookID, &parent, &node.OrderIndex, &node.Title); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return usecase.Node{}, usecase.ErrNodeNotFound
		}
		return usecase.Node{}, err
	}
	if parent.Valid {
		node.ParentID = &parent.Int64
	}

	return node, nil
}

// Reorder resets order_index under a parent in a single transaction.
func (r *NodeRepository) Reorder(ctx context.Context, userID string, bookID int64, parentID *int64, nodeIDs []int64) error {
	if r.pool == nil {
		return errors.New("database not configured")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if len(nodeIDs) == 0 {
		return tx.Commit(ctx)
	}

	seen := make(map[int64]struct{}, len(nodeIDs))
	for _, id := range nodeIDs {
		if _, exists := seen[id]; exists {
			return usecase.ErrInvalidNodeReorder
		}
		seen[id] = struct{}{}
	}

	rows, err := tx.Query(ctx, `
		SELECT id, parent_id
		FROM nodes
		WHERE user_id = $1 AND book_id = $2 AND id = ANY($3)
	`, userID, bookID, nodeIDs)
	if err != nil {
		return err
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var id int64
		var parent pgtype.Int8
		if err := rows.Scan(&id, &parent); err != nil {
			return err
		}
		count++
		if parentID == nil {
			if parent.Valid {
				return usecase.ErrInvalidNodeReorder
			}
			continue
		}
		if !parent.Valid || parent.Int64 != *parentID {
			return usecase.ErrInvalidNodeReorder
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if count != len(nodeIDs) {
		return usecase.ErrInvalidNodeReorder
	}

	for index, id := range nodeIDs {
		if _, err := tx.Exec(ctx, `
			UPDATE nodes
			SET order_index = $1
			WHERE user_id = $2 AND book_id = $3 AND id = $4
		`, index, userID, bookID, id); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// MoveSubtree relocates a node and its descendants to another book.
func (r *NodeRepository) MoveSubtree(ctx context.Context, userID string, bookID int64, nodeID int64, dstBookID int64, dstParentID *int64, dstOrderIndex int) (usecase.Node, error) {
	if r.pool == nil {
		return usecase.Node{}, errors.New("database not configured")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return usecase.Node{}, err
	}
	defer tx.Rollback(ctx)

	var rootID int64
	if err := tx.QueryRow(ctx, `
		SELECT id
		FROM nodes
		WHERE user_id = $1 AND book_id = $2 AND id = $3
	`, userID, bookID, nodeID).Scan(&rootID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return usecase.Node{}, usecase.ErrNodeNotFound
		}
		return usecase.Node{}, err
	}

	if dstParentID != nil {
		if *dstParentID == nodeID {
			return usecase.Node{}, usecase.ErrInvalidMoveParent
		}

		// Parent must exist in destination book.
		var parentID int64
		if err := tx.QueryRow(ctx, `
			SELECT id
			FROM nodes
			WHERE user_id = $1 AND book_id = $2 AND id = $3
		`, userID, dstBookID, *dstParentID).Scan(&parentID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return usecase.Node{}, usecase.ErrInvalidMoveParent
			}
			return usecase.Node{}, err
		}

		var isInSubtree bool
		if err := tx.QueryRow(ctx, `
			WITH RECURSIVE subtree AS (
				SELECT id
				FROM nodes
				WHERE user_id = $1 AND book_id = $2 AND id = $3
				UNION ALL
				SELECT n.id
				FROM nodes n
				INNER JOIN subtree s ON n.parent_id = s.id
				WHERE n.user_id = $1 AND n.book_id = $2
			)
			SELECT EXISTS (SELECT 1 FROM subtree WHERE id = $4)
		`, userID, bookID, nodeID, *dstParentID).Scan(&isInSubtree); err != nil {
			return usecase.Node{}, err
		}
		if isInSubtree {
			return usecase.Node{}, usecase.ErrInvalidMoveParent
		}
	}

	// 3) Move the entire subtree to the destination book.
	// IMPORTANT: Keep the recursion constrained to the original source book.
	_, err = tx.Exec(ctx, `
		WITH RECURSIVE subtree AS (
			SELECT id
			FROM nodes
			WHERE user_id = $1 AND book_id = $2 AND id = $3
			UNION ALL
			SELECT n.id
			FROM nodes n
			INNER JOIN subtree s ON n.parent_id = s.id
			WHERE n.user_id = $1 AND n.book_id = $2
		)
		UPDATE nodes
		SET book_id = $4
		WHERE user_id = $1 AND id IN (SELECT id FROM subtree)
	`, userID, bookID, nodeID, dstBookID)
	if err != nil {
		return usecase.Node{}, err
	}

	var node usecase.Node
	row := tx.QueryRow(ctx, `
		UPDATE nodes
		SET parent_id = $1, order_index = $2, book_id = $3
		WHERE user_id = $4 AND id = $5
		RETURNING id, book_id, parent_id, order_index, title
	`, dstParentID, dstOrderIndex, dstBookID, userID, nodeID)

	var parent pgtype.Int8
	if err := row.Scan(&node.ID, &node.BookID, &parent, &node.OrderIndex, &node.Title); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return usecase.Node{}, usecase.ErrNodeNotFound
		}
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
