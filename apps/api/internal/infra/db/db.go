package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nagasawakenji/studytree-ai/apps/api/internal/observability/logger"
)

const pingTimeout = 5 * time.Second

// Init initializes a database connection pool when a database URL is provided.
func Init(ctx context.Context, log *logger.Logger, databaseURL string) (*pgxpool.Pool, error) {
	if databaseURL == "" {
		log.Info("db disabled", map[string]any{
			"reason": "DATABASE_URL is empty",
		})
		return nil, nil
	}

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		log.Error("db config error", map[string]any{
			"error": err.Error(),
		})
		return nil, err
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Error("db connection error", map[string]any{
			"error": err.Error(),
		})
		return nil, err
	}

	pingCtx, cancel := context.WithTimeout(ctx, pingTimeout)
	defer cancel()

	if err := pool.Ping(pingCtx); err != nil {
		log.Error("db ping failed", map[string]any{
			"error": err.Error(),
		})
		pool.Close()
		return nil, err
	}

	log.Info("db connected", map[string]any{})
	return pool, nil
}
