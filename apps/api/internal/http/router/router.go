package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/http/handler"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/http/middleware"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/repository"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

// NewRouter sets up the HTTP routes and middleware.
func NewRouter(log *logger.Logger, pool *pgxpool.Pool) http.Handler {
	bookRepo := repository.NewBookRepository(pool)
	nodeRepo := repository.NewNodeRepository(pool)
	bookUsecase := usecase.NewBookUsecase(bookRepo)
	nodeUsecase := usecase.NewNodeUsecase(nodeRepo)

	return NewRouterWithUsecases(log, bookUsecase, nodeUsecase)
}

// NewRouterWithUsecases sets up the HTTP routes with injected usecases.
func NewRouterWithUsecases(log *logger.Logger, bookUsecase *usecase.BookUsecase, nodeUsecase *usecase.NodeUsecase) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.AccessLog(log))

	bookHandler := handler.NewBookHandler(bookUsecase)
	nodeHandler := handler.NewNodeHandler(nodeUsecase)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/healthz", handler.Healthz)
		r.Route("/books", func(r chi.Router) {
			r.Post("/", bookHandler.Create)
			r.Get("/", bookHandler.List)
			r.Route("/{book_id}/nodes", func(r chi.Router) {
				r.Post("/", nodeHandler.Create)
				r.Get("/", nodeHandler.List)
				r.Patch("/{node_id}", nodeHandler.Update)
				r.Patch("/{node_id}/move", nodeHandler.Move)
				r.Put("/reorder", nodeHandler.Reorder)
			})
		})
	})

	return r
}
