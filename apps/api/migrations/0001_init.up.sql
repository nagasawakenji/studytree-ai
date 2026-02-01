-- 0001_init.up.sql
-- StudyTree MVP:
-- users / books / nodes (tree) / summaries(json) / problems(json)

CREATE TABLE IF NOT EXISTS users (
                                   id          TEXT PRIMARY KEY,                 -- auth subject / user identifier
                                   created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS books (
                                   id          BIGSERIAL PRIMARY KEY,
                                   user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

-- composite reference target for "same-user" FK
CREATE UNIQUE INDEX IF NOT EXISTS uq_books_user_id_id
  ON books(user_id, id);

CREATE INDEX IF NOT EXISTS idx_books_user_created
  ON books(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nodes (
                                   id          BIGSERIAL PRIMARY KEY,
                                   user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id     BIGINT NOT NULL,
  parent_id   BIGINT NULL,
  order_index INT NOT NULL DEFAULT 0,
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure node belongs to the same user's book
  CONSTRAINT fk_nodes_book_same_user
  FOREIGN KEY (user_id, book_id)
  REFERENCES books(user_id, id)
                                                                                  ON DELETE CASCADE,

  -- Self-referential tree. Kept simple (cannot enforce same user via FK here without extra composite constraints).
  CONSTRAINT fk_nodes_parent
  FOREIGN KEY (parent_id)
  REFERENCES nodes(id)
                                                                                  ON DELETE CASCADE
  );

-- For fetching children in order: (book_id, parent_id) + sort by order_index
CREATE INDEX IF NOT EXISTS idx_nodes_user_book_parent_order
  ON nodes(user_id, book_id, parent_id, order_index, id);

-- composite reference target for "same-user" FK
CREATE UNIQUE INDEX IF NOT EXISTS uq_nodes_user_id_id
  ON nodes(user_id, id);

CREATE TABLE IF NOT EXISTS summaries (
                                       id          BIGSERIAL PRIMARY KEY,
                                       user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id     BIGINT NOT NULL,
  schema_ver  INT NOT NULL DEFAULT 1,
  content     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_summaries_node_same_user
  FOREIGN KEY (user_id, node_id)
  REFERENCES nodes(user_id, id)
                                                                                      ON DELETE CASCADE
  );

CREATE INDEX IF NOT EXISTS idx_summaries_user_node
  ON summaries(user_id, node_id);

CREATE TABLE IF NOT EXISTS problems (
                                      id          BIGSERIAL PRIMARY KEY,
                                      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id     BIGINT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'qa',  -- qa / mcq / cloze etc. (MVPは自由)
  schema_ver  INT NOT NULL DEFAULT 1,
  content     JSONB NOT NULL,             -- problem.schema.json に従う想定（後で）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_problems_node_same_user
  FOREIGN KEY (user_id, node_id)
  REFERENCES nodes(user_id, id)
                                                                                     ON DELETE CASCADE
  );

CREATE INDEX IF NOT EXISTS idx_problems_user_node
  ON problems(user_id, node_id);

CREATE INDEX IF NOT EXISTS idx_problems_user_created
  ON problems(user_id, created_at DESC);
