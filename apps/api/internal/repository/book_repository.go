package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

// BookRepository persists books in Postgres.
type BookRepository struct {
	pool *pgxpool.Pool
}

// NewBookRepository creates a new BookRepository.
func NewBookRepository(pool *pgxpool.Pool) *BookRepository {
	return &BookRepository{pool: pool}
}

// Create inserts a book for a user.
func (r *BookRepository) Create(ctx context.Context, userID, title string) (usecase.Book, error) {
	if r.pool == nil {
		return usecase.Book{}, errors.New("database not configured")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return usecase.Book{}, err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, "INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING", userID)
	if err != nil {
		return usecase.Book{}, err
	}

	var book usecase.Book
	row := tx.QueryRow(ctx, "INSERT INTO books (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at", userID, title)
	if err := row.Scan(&book.ID, &book.Title, &book.CreatedAt); err != nil {
		return usecase.Book{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return usecase.Book{}, err
	}

	return book, nil
}

// List returns books for a user.
func (r *BookRepository) List(ctx context.Context, userID string) ([]usecase.Book, error) {
	if r.pool == nil {
		return nil, errors.New("database not configured")
	}

	rows, err := r.pool.Query(ctx, "SELECT id, title, created_at FROM books WHERE user_id = $1 ORDER BY id ASC", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var books []usecase.Book
	for rows.Next() {
		var book usecase.Book
		if err := rows.Scan(&book.ID, &book.Title, &book.CreatedAt); err != nil {
			return nil, err
		}
		books = append(books, book)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return books, nil
}
