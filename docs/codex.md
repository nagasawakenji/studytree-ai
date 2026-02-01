

# Codex Playbook (StudyTree AI)

このドキュメントは、Codex（AIコーディング補助）に **迷いなく・暴走せず** 実装させるための運用ルールとテンプレートを定義する。

## 0. 最重要（守らない場合は差し戻し）

1. **docs が唯一の設計ソース**
   - 実装は `docs/design.md`, `docs/api.md`, `docs/data.md`, `docs/schemas/*.json` に従う。
   - docs に存在しない仕様を勝手に追加しない。

2. **MVP優先**
   - まず CRUD と保存・閲覧を完成させる。
   - 生成AI（summary:regenerate / problems:generate）や検索高度化は後回し。

3. **変更範囲の固定**
   - タスクごとに「変更してよいディレクトリ」を明示する。
   - 許可のないディレクトリに変更を入れない。

4. **差分がレビュー可能な単位で**
   - 1タスク = 1コミット相当の差分量を目安。
   - 大規模リファクタ・一括置換は禁止。

5. **動作確認が完了条件**
   - 最低限 `make dev-api` または `go test ./...` が通る状態で終える。
   - 追加したAPIは `curl` 例で動作確認できるようにする。

---

## 1. リポジトリ構成（前提）

- API: `apps/api`（Go）
- Web: `apps/web`（Next.js）
- Docs: `docs/`（設計の唯一の真実）
- DB migrations: `apps/api/migrations/`

---

## 2. 実装スタイル（API / Go）

### 2.1 レイヤ方針
- `internal/domain`: エンティティ/値オブジェクト（薄くてよい）
- `internal/usecase`: ユースケース（アプリ層）
- `internal/repo`: リポジトリIF
- `internal/infra/db`: PostgreSQL実装
- `internal/http`: router/handler/middleware

> MVPでは、domain/usecase/repo を薄く保ち、過剰な抽象化は避ける。

### 2.2 エラーポリシー
- `docs/api.md` のエラー方針（400/404/409/500）に従う。
- 例外的なステータスコードや独自仕様は増やさない。

### 2.3 Summary JSON のルール
- `docs/schemas/summary.schema.json` に準拠。
- **短縮キーの変換は禁止**（保存も返却も短縮キーのまま）。
- `schema_version` は `content.v` と一致させる。

---

## 3. タスク実行プロトコル（Codexへの依頼形式）

Codexへ依頼する際は、毎回この順で出力させる：

1. **変更ファイル一覧**（新規/修正の列挙）
2. **実装方針（5〜10行）**（docsのどこに従ったかを含む）
3. **コード差分**（必要な最小）
4. **動作確認手順**（コマンド + 期待結果）

---

## 4. Codex依頼テンプレ（コピペ用）

### 4.1 共通テンプレ

```text
あなたはこのリポジトリ（StudyTree AI）で実装します。

参照すべき設計:
- docs/design.md
- docs/api.md
- docs/data.md
- docs/schemas/summary.schema.json

目的:
- （例）Node CRUD API を追加する

変更してよい範囲:
- （例）apps/api 配下のみ（apps/web や infra は変更しない）

制約:
- MVP優先。docsにない仕様を追加しない
- Summary JSON の短縮キー変換は禁止
- 大規模リファクタ禁止
- 変更ファイル一覧を最初に出す

完了条件:
- go test ./... が通る（可能な範囲）
- 追加APIは curl 例で確認できる

まず最初に:
1) 変更ファイル一覧
2) 実装方針（5〜10行）
3) 最小のコード差分
4) 動作確認コマンド
```

### 4.2 例: /healthz と request_id を追加

```text
目的:
- GET /api/v1/healthz を追加
- X-Request-Id が無い場合は生成してレスポンスヘッダに付与

変更してよい範囲:
- apps/api のみ

完了条件:
- make dev-api で起動
- curl -i localhost:8080/api/v1/healthz で {"ok":true} が返る
- レスポンスヘッダに X-Request-Id が含まれる
```

---

## 5. MVPの実装順（推奨）

1. API起動（/healthz） + request_id + JSONログ
2. DB接続 + migrations 実行（ローカルは docker compose）
3. Books CRUD
4. Nodes CRUD（ツリー）
5. Summaries GET/PUT（JSONB保存、schema_version整合）
6. Problems 手入力 CRUD
7. Attempts 保存

---

## 6. レビュー観点（差し戻し条件）

- docsに無いAPI/フィールド/動作を増やしている
- Summary JSON のキーを勝手に変換している
- タスクの変更範囲を逸脱している
- テスト/起動手順が書かれていない
- 1タスクの差分が大きすぎてレビュー不能

---
