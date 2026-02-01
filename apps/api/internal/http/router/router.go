package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/http/handler"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/http/middleware"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
)

// NewRouter sets up the HTTP routes and middleware.
func NewRouter(log *logger.Logger) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.AccessLog(log))

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/healthz", handler.Healthz)
	})

	return r
}
