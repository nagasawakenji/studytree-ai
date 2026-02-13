# Web Manual Smoke Check (Import -> Book -> Nodes -> Problems)

この手順は、Next.js dynamic params (`params is a Promise...`) 対応後の最小動作確認用です。

## Prerequisites

- `DATABASE_URL` が設定されていること（`apps/api`）
- `OPENAI_API_KEY` が設定されていること（Import 実行時）
- API と Web の依存がインストール済みであること

## Steps

1. API を起動する。
   - `cd apps/api`
   - `go run ./cmd/api`
2. Web を起動する（API への rewrite が有効な設定で）。
   - 別ターミナルで `cd apps/web`
   - `npm run dev`
3. [http://localhost:3000/import](http://localhost:3000/import) を開き、適当なテキストを投入して `Import` を実行する。
4. `Open book` からホームへ戻り、book/node が表示されることを確認する。
5. ノードを展開し、problem 一覧が表示されることを確認する。
6. `Add problem` から problem を作成する。
7. 作成後に `/problems/[id]` へ遷移し、problem が表示されることを確認する。
   - 本文と解答が Markdown として表示されること
8. ブラウザコンソールで次のエラーが出ていないことを確認する。
   - `params is a Promise and must be unwrapped with React.use()`

