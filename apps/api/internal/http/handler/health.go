package handler

import (
	"encoding/json"
	"net/http"
)

type healthResponse struct {
	OK bool `json:"ok"`
}

// Healthz handles health check requests.
func Healthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(healthResponse{OK: true})
}
