package middleware

import (
	"net/http"
	"time"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/request_id"
)

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(statusCode int) {
	rw.status = statusCode
	rw.ResponseWriter.WriteHeader(statusCode)
}

// AccessLog emits a structured access log per request.
func AccessLog(log *logger.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			wrapped := &responseWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(wrapped, r)

			latency := time.Since(start)
			log.Info("access", map[string]any{
				"request_id": request_id.FromContext(r.Context()),
				"method":     r.Method,
				"path":       r.URL.Path,
				"status":     wrapped.status,
				"latency_ms": latency.Milliseconds(),
			})
		})
	}
}
