package request_id

import (
	"context"

	"github.com/google/uuid"
)

// HeaderName is the HTTP header name for request IDs.
const HeaderName = "X-Request-Id"

type contextKey struct{}

// New generates a new request ID.
func New() string {
	return uuid.NewString()
}

// With attaches a request ID to the context.
func With(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, contextKey{}, requestID)
}

// FromContext retrieves a request ID from the context.
func FromContext(ctx context.Context) string {
	value := ctx.Value(contextKey{})
	if value == nil {
		return ""
	}
	requestID, ok := value.(string)
	if !ok {
		return ""
	}
	return requestID
}
