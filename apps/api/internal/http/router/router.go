package router

import (
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/http/handler"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/http/middleware"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/llm"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/repository"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/usecase"
)

// NewRouter sets up the HTTP routes and middleware.
func NewRouter(log *logger.Logger, pool *pgxpool.Pool) http.Handler {
	bookRepo := repository.NewBookRepository(pool)
	nodeRepo := repository.NewNodeRepository(pool)
	problemRepo := repository.NewProblemRepository(pool)
	importRepo := repository.NewImportRepository(pool)
	importPlanner := llm.NewOpenAIClient(http.DefaultClient, os.Getenv("OPENAI_API_KEY"), os.Getenv("OPENAI_MODEL"), log)
	bookUsecase := usecase.NewBookUsecase(bookRepo)
	nodeUsecase := usecase.NewNodeUsecase(nodeRepo)
	problemUsecase := usecase.NewProblemUsecase(problemRepo)
	importUsecase := usecase.NewImportUsecase(importRepo, importPlanner)

	return NewRouterWithUsecases(log, bookUsecase, nodeUsecase, problemUsecase, importUsecase)
}

// NewRouterWithUsecases sets up the HTTP routes with injected usecases.
func NewRouterWithUsecases(log *logger.Logger, bookUsecase *usecase.BookUsecase, nodeUsecase *usecase.NodeUsecase, problemUsecase *usecase.ProblemUsecase, importUsecase ...*usecase.ImportUsecase) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.AccessLog(log))

	bookHandler := handler.NewBookHandler(bookUsecase)
	nodeHandler := handler.NewNodeHandler(nodeUsecase)
	problemHandler := handler.NewProblemHandler(problemUsecase)
	var importHandler *handler.ImportHandler
	if len(importUsecase) > 0 {
		importHandler = handler.NewImportHandler(importUsecase[0], log)
	} else {
		importHandler = handler.NewImportHandler(nil, log)
	}

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
		r.Route("/nodes/{node_id}/problems", func(r chi.Router) {
			r.Get("/", problemHandler.ListByNode)
			r.Post("/", problemHandler.Create)
		})
		r.Get("/problems/{problem_id}", problemHandler.GetByID)
		r.Post("/imports/chatgpt", importHandler.ChatGPT)
	})

	return r
}
