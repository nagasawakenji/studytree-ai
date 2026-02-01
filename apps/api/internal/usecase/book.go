package usecase

import (
	"context"
	"time"
)

const localUserID = "local-dev"

// Book represents a study book.
type Book struct {
	ID        int64
	Title     string
	CreatedAt time.Time
}

// BookRepository defines persistence for books.
type BookRepository interface {
	Create(ctx context.Context, userID, title string) (Book, error)
	List(ctx context.Context, userID string) ([]Book, error)
}

// BookUsecase handles book operations.
type BookUsecase struct {
	repo BookRepository
}

// NewBookUsecase builds a BookUsecase.
func NewBookUsecase(repo BookRepository) *BookUsecase {
	return &BookUsecase{repo: repo}
}

// Create registers a new book for the local user.
func (u *BookUsecase) Create(ctx context.Context, title string) (Book, error) {
	return u.repo.Create(ctx, localUserID, title)
}

// List returns books for the local user.
func (u *BookUsecase) List(ctx context.Context) ([]Book, error) {
	return u.repo.List(ctx, localUserID)
}
