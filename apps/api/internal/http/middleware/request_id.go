package middleware

import (
	"net/http"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/request_id"
)

// RequestID ensures every request has a request ID header and context value.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get(request_id.HeaderName)
		if requestID == "" {
			requestID = request_id.New()
		}

		w.Header().Set(request_id.HeaderName, requestID)
		ctx := request_id.With(r.Context(), requestID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
