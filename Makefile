.PHONY: db-up db-down dev-api dev-web

db-up:
	docker compose -f infra/docker/docker-compose.yml up -d

db-down:
	docker compose -f infra/docker/docker-compose.yml down

dev-api:
	cd apps/api && go run ./cmd/api

dev-web:
	cd apps/web && npm run dev
