

# StudyTree AI Data Design (MVP)

このドキュメントは **MVPのデータ設計の方針** を定義する。
- 詳細DDL（CREATE TABLEの完全版）は `apps/api/migrations/` に置く。
- Codex/実装者は、ここに書かれていない概念（共有、課金、全文検索、ベクトル検索等）を勝手に追加しない。

---

## 1. 原則

### 1.1 役割分離
- **ツリー（構造）** は `nodes` が持つ（`parent_id` + `order`）。
- **依存関係（前提）** は `node_prereq` が持つ（グラフ）。
- **要約（長期記憶）** は `summaries` が持つ（`content` は JSONB、`docs/schemas/summary.schema.json` に準拠）。
- **問題** は `problems` が持つ（手入力が先、生成は後）。
- **解答履歴** は `attempts` が持つ。

### 1.2 スキーマの安定性
- Summary の JSON は短縮キーのまま保存し、変換しない。
- Summary には `schema_version` を持ち、`content.v` と一致させる。
- 破壊的変更をする場合は `schema_version` を上げる。古いデータはマイグレーション（後回し可能）。

### 1.3 マルチテナント（ユーザー分離）
- MVPでは認証を簡略化してもよいが、データモデルは **必ず `user_id` を持つ**。
- すべての主要テーブルは `user_id` を含み、クエリは user_id でスコープされる。

---

## 2. ID・型

### 2.1 ID
- `user_id`, `book_id`, `node_id`, `problem_id`, `attempt_id` は文字列ID（UUID推奨）。

### 2.2 JSON
- `summaries.content` は JSONB。
- JSON Schema 検証の対象（MVPでは必須フィールド＋型チェックでも可）。

---

## 3. コアエンティティ（責務）

### 3.1 users
- 認証導入後のために用意（MVP初期はダミーでも可）。
- 最小フィールド：`id`, `created_at`。

### 3.2 books
- 本のメタ情報
- フィールド例：
  - `id`
  - `user_id`
  - `title`
  - `author`（任意）
  - `note`（任意）
  - `created_at`
  - `updated_at`

**制約**
- `(user_id, title)` は重複許容（MVPでは厳密にしない）。

### 3.3 nodes
- 目次ツリーのノード（章/節/項）
- フィールド例：
  - `id`
  - `user_id`
  - `book_id`
  - `type`（`chapter|section|topic`）
  - `title`
  - `parent_id`（chapterの親はNULL）
  - `order`（同一parent内での並び）
  - `created_at`
  - `updated_at`

**制約**
- `book_id` は books に外部キー。
- `parent_id` は nodes に自己参照FK（NULL可）。
- `type` は enum相当（CHECK制約）。

**MVP運用ルール**
- Node削除は「子が存在する場合は不可（409）」とする（安全側）。

### 3.4 node_prereq
- 前提（依存関係）を表すグラフ
- フィールド例：
  - `user_id`
  - `node_id`（対象）
  - `prereq_node_id`（前提）
  - `created_at`

**制約**
- `(user_id, node_id, prereq_node_id)` は一意。
- 同一 book 内に限定したい場合はアプリ層でチェック（MVP）。

### 3.5 summaries
- Nodeに紐づく要約（長期記憶）
- 基本は `section` / `topic` に付与（chapterは任意）
- フィールド例：
  - `id`
  - `user_id`
  - `node_id`（ユニーク：nodeに1つ）
  - `schema_version`（= content.v）
  - `content`（JSONB、`summary.schema.json` 準拠）
  - `created_at`
  - `updated_at`

**制約**
- `node_id` は UNIQUE。

**MVP運用ルール**
- API PUTで上書き（履歴は持たない）。

### 3.6 problems
- Nodeに紐づく問題
- フィールド例：
  - `id`
  - `user_id`
  - `node_id`
  - `difficulty`（`basic|standard|advanced`）
  - `format`（`short|calc|proof|concept`）
  - `intent`（ねらい）
  - `statement`（問題文）
  - `answer`（模範解答）
  - `outline`（任意）
  - `hints`（text[] または JSONB配列）
  - `prereq_node_ids`（text[] または JSONB配列）
  - `tags`（text[] または JSONB配列）
  - `created_at`
  - `updated_at`

**実装メモ（PostgreSQL）**
- `hints/tags/prereq_node_ids` は MVPでは JSONB配列でもよい（検索要件が固まってから正規化）。

### 3.7 attempts
- Problemに対するユーザー解答履歴
- フィールド例：
  - `id`
  - `user_id`
  - `problem_id`
  - `answer_text`（ユーザー解答）
  - `self_score`（任意：0..5など）
  - `note`（任意）
  - `created_at`

**制約**
- `problem_id` は problems に外部キー。

---

## 4. インデックス（MVP最小）
- `books(user_id, created_at)`
- `nodes(book_id, parent_id, order)`
- `nodes(user_id, book_id)`
- `summaries(user_id, node_id)`（node_idはUNIQUE）
- `problems(user_id, node_id, created_at)`
- `attempts(user_id, problem_id, created_at)`

---

## 5. 将来拡張の余地（MVPではやらない）
- summaries の履歴（summary_versions）
- 問題生成ログ（generation_logs）
- 検索の高度化（GIN index on JSONB / full-text / vector）
- 共有・共同編集（acl / org / workspace）

---
