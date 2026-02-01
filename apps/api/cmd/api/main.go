package main

import (
	"context"
	"errors"
	"net/http"
	"os"

	"github.com/nagasawakenji/studytree-ai/apps/api/internal/config"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/http/router"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/infra/db"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
)

func main() {
	cfg := config.Load()
	log := logger.NewJSONLogger(os.Stdout)
	ctx := context.Background()

	pool, err := db.Init(ctx, log, cfg.DatabaseURL)
	if err != nil {
		log.Error("startup failed", map[string]any{"error": err.Error()})
		os.Exit(1)
	}
	if pool != nil {
		defer pool.Close()
	}

	addr := ":" + cfg.Port
	server := &http.Server{
		Addr:    addr,
		Handler: router.NewRouter(log, pool),
	}

	log.Info("server listening", map[string]any{"addr": addr})
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("server error", map[string]any{"error": err.Error()})
		os.Exit(1)
	}
}
