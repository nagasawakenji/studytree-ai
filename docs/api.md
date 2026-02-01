

# StudyTree AI API (MVP)

このドキュメントは **MVPで実装するAPIのみ** を定義する。Codex/実装者はここに書かれていない機能（共有、課金、検索高度化、LLM周りの拡張など）を勝手に追加しない。

## 方針（MVPでの固定ルール）

- REST API とする（GraphQLは採用しない）。
- 返却・保存する Summary は **`docs/schemas/summary.schema.json` に準拠したJSON**（短縮キー: `v,sc,sy,th,pt,pi,tp,pf,rq,tg,x`）を **そのまま** 使う。キー名の変換はしない。
- Tree 構造は `Node` で表現し、`parent_id` により階層を表す。
- Node の `type` は固定：`chapter | section | topic`。
- MVPでは「移動（ドラッグ&ドロップ）」「全文検索」「Problems generate」「Summary regenerate」は**後回し**（APIは予約してもよいが、実装はしない）。
- 認証はMVPの初期段階では簡略化可能（例: ダミーの user_id を固定）。ただしデータモデルは `user_id` を想定して作る。

---

## 共通

### ベースURL
- `/api/v1`

### 共通ヘッダ
- `Content-Type: application/json`
- `X-Request-Id`（任意）: 未指定の場合はサーバで発行しレスポンスに返す

### 共通レスポンス
- 成功: 2xx + JSON
- 失敗: `application/json` で

```json
{ "error": { "code": "...", "message": "..." } }
```

### IDの形式
- `book_id`, `node_id`, `problem_id`, `attempt_id` は文字列ID（UUID推奨）

---

## リソースモデル（MVP）

### Book
- ユーザーが学習対象の「本」を作成する単位

### Node
- 本の目次ツリーを構成するノード
- `type`: `chapter | section | topic`
- `parent_id`: 親ノード（chapterの親は null）

### Summary
- 主に `section` / `topic` ノードに紐づく要約
- `content` は `summary.schema.json` 準拠（短縮キー）

### Problem
- Node に紐づく問題

### Attempt
- Problem に対するユーザー解答履歴

---

## API一覧（MVPで実装するもの）

### 1. Health

#### GET `/api/v1/healthz`
- 用途: 起動確認

**200**
```json
{ "ok": true }
```

---

### 2. Books

#### POST `/api/v1/books`
**Request**
```json
{ "title": "string", "author": "string?", "note": "string?" }
```

**201**
```json
{ "book_id": "string", "title": "...", "author": null, "note": null, "created_at": "..." }
```

#### GET `/api/v1/books`
**200**
```json
{ "items": [ { "book_id": "...", "title": "..." } ] }
```

#### GET `/api/v1/books/{book_id}`
**200**
```json
{ "book_id": "...", "title": "...", "author": null, "note": null }
```

---

### 3. Nodes (Tree)

#### POST `/api/v1/books/{book_id}/nodes`
- 用途: ツリーにノード追加

**Request**
```json
{
  "type": "chapter|section|topic",
  "title": "string",
  "parent_id": "string?",
  "order": 0
}
```

**201**
```json
{
  "node_id": "string",
  "book_id": "string",
  "type": "section",
  "title": "...",
  "parent_id": "...",
  "order": 0,
  "created_at": "...",
  "updated_at": "..."
}
```

#### GET `/api/v1/books/{book_id}/nodes`
- 用途: 本のツリーを取得（MVPはフラット返却でOK。UI側で組み立てる）

**200**
```json
{
  "items": [
    { "node_id": "...", "book_id": "...", "type": "chapter", "title": "...", "parent_id": null, "order": 0 },
    { "node_id": "...", "book_id": "...", "type": "section", "title": "...", "parent_id": "...", "order": 0 }
  ]
}
```

#### GET `/api/v1/nodes/{node_id}`
**200**
```json
{ "node_id": "...", "book_id": "...", "type": "topic", "title": "...", "parent_id": "...", "order": 2 }
```

#### PATCH `/api/v1/nodes/{node_id}`
- MVP: タイトル変更、並び順変更、親変更（=移動）を扱う

**Request**
```json
{ "title": "string?", "parent_id": "string?", "order": 0 }
```

**200**
```json
{ "node_id": "...", "title": "...", "parent_id": "...", "order": 0, "updated_at": "..." }
```

#### DELETE `/api/v1/nodes/{node_id}`
- MVP: 子がある場合は 409 を返す（安全側）

**204** (no body)

---

### 4. Summaries

#### GET `/api/v1/nodes/{node_id}/summary`
- 返す `content` は **短縮キー**のまま

**200**
```json
{ "node_id": "...", "schema_version": 1, "content": { "v": 1, "sc": "...", "sy": {}, "th": [], "pt": [], "pi": [], "tp": [], "pf": [], "rq": [], "tg": [] } }
```

- 未作成の場合は 404

#### PUT `/api/v1/nodes/{node_id}/summary`
- 用途: ユーザーが要約JSONを手編集して保存（MVPの中心）
- 受け取った `content.v` を `schema_version` にも反映

**Request**
```json
{ "content": { "v": 1, "sc": "...", "sy": {}, "th": [], "pt": [], "pi": [], "tp": [], "pf": [], "rq": [], "tg": [], "x": {} } }
```

**200**
```json
{ "node_id": "...", "schema_version": 1, "content": { "v": 1, "sc": "...", "sy": {}, "th": [], "pt": [], "pi": [], "tp": [], "pf": [], "rq": [], "tg": [], "x": {} }, "updated_at": "..." }
```

> NOTE: `content` のバリデーションはサーバ側で JSON Schema によって行う（実装簡略化のため、MVPでは必須フィールドと型チェックだけでも可）。

---

### 5. Problems

#### POST `/api/v1/nodes/{node_id}/problems`
- 用途: 問題を手で保存（MVPは生成より先）

**Request**
```json
{
  "difficulty": "basic|standard|advanced",
  "format": "short|calc|proof|concept",
  "intent": "string",
  "statement": "string",
  "answer": "string",
  "outline": "string?",
  "hints": ["string"],
  "prereq_node_ids": ["string"],
  "tags": ["string"]
}
```

**201**
```json
{ "problem_id": "...", "node_id": "...", "difficulty": "standard", "format": "calc", "intent": "...", "created_at": "..." }
```

#### GET `/api/v1/nodes/{node_id}/problems`
**200**
```json
{ "items": [ { "problem_id": "...", "difficulty": "basic", "format": "short", "intent": "..." } ] }
```

#### GET `/api/v1/problems/{problem_id}`
**200**
```json
{
  "problem_id": "...",
  "node_id": "...",
  "difficulty": "standard",
  "format": "calc",
  "intent": "...",
  "statement": "...",
  "answer": "...",
  "outline": null,
  "hints": [],
  "prereq_node_ids": [],
  "tags": []
}
```

#### PATCH `/api/v1/problems/{problem_id}`
- MVP: 全フィールド更新可能（部分更新）

**Request**
```json
{ "difficulty": "...", "format": "...", "intent": "...", "statement": "...", "answer": "...", "outline": "...", "hints": ["..."], "prereq_node_ids": ["..."], "tags": ["..."] }
```

**200**
```json
{ "problem_id": "...", "updated_at": "..." }
```

---

### 6. Attempts

#### POST `/api/v1/problems/{problem_id}/attempts`
- 用途: ユーザーの解答を保存

**Request**
```json
{
  "answer_text": "string",
  "self_score": 0,
  "note": "string?"
}
```

**201**
```json
{ "attempt_id": "...", "problem_id": "...", "created_at": "..." }
```

#### GET `/api/v1/problems/{problem_id}/attempts`
**200**
```json
{ "items": [ { "attempt_id": "...", "created_at": "...", "self_score": 3 } ] }
```

---

## 予約（MVP後）: LLM生成系
MVPでは実装しないが、将来のためにエンドポイント名は予約しておく。

- `POST /api/v1/nodes/{node_id}/summary:regenerate`
- `POST /api/v1/nodes/{node_id}/problems:generate`

---

## エラーポリシー（最小）
- 400: バリデーションエラー
- 401: 未認証（認証導入後）
- 403: 他ユーザーリソースへのアクセス
- 404: リソースなし
- 409: 競合（例: 子ノードが存在するNode削除）
- 500: サーバエラー

---
