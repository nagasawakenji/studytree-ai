"use client";

import Link from "next/link";
import { useState } from "react";

import { createImport, ImportApiError, type CreateImportResponse } from "@/lib/api";

export default function ImportPage() {
  const [bookTitle, setBookTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [maxDepth, setMaxDepth] = useState(3);
  const [problemsPerLeaf, setProblemsPerLeaf] = useState(3);
  const [language, setLanguage] = useState("ja");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreateImportResponse | null>(null);
  const [error, setError] = useState<{
    status?: number;
    message: string;
    reason?: string;
    requestId?: string;
  } | null>(null);

  const onGenerate = async () => {
    if (!bookTitle.trim() || !sourceText.trim()) {
      setError({ message: "book title and source text are required" });
      return;
    }
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const next = await createImport({
        book_title: bookTitle.trim(),
        source_text: sourceText.trim(),
        options: {
          max_depth: maxDepth,
          problems_per_leaf: problemsPerLeaf,
          language: language.trim() || "ja",
        },
      });
      setResult(next);
    } catch (err) {
      if (err instanceof ImportApiError) {
        setError({
          status: err.status,
          message: err.message,
          reason: err.reason,
          requestId: err.requestId,
        });
      } else {
        setError({
          message: err instanceof Error ? err.message : "failed to import",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 p-8 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Import from ChatGPT</h1>
          <Link className="text-sm text-zinc-600 underline" href="/">
            Back
          </Link>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium">Book title</span>
              <input
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={bookTitle}
                onChange={(event) => setBookTitle(event.target.value)}
                placeholder="線形代数"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium">Source text</span>
              <textarea
                className="h-56 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                placeholder="章タイトル一覧、範囲、要件など"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Max depth</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  type="number"
                  min={1}
                  value={maxDepth}
                  onChange={(event) =>
                    setMaxDepth(Math.max(1, Number(event.target.value) || 1))
                  }
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Problems / leaf</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  type="number"
                  min={1}
                  value={problemsPerLeaf}
                  onChange={(event) =>
                    setProblemsPerLeaf(
                      Math.max(1, Number(event.target.value) || 1),
                    )
                  }
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Language</span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  placeholder="ja"
                />
              </label>
            </div>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-medium">Import failed</p>
                {error.status !== undefined ? <p>HTTP status: {error.status}</p> : null}
                <p>Error: {error.message}</p>
                {error.reason ? <p>Reason: {error.reason}</p> : null}
                {error.requestId ? <p>Request ID: {error.requestId}</p> : null}
              </div>
            ) : null}

            {result ? (
              <div className="space-y-3">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <p className="font-medium">Import completed</p>
                  <p>Book ID: {result.book_id}</p>
                  <p>Request ID: {result.request_id}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm">
                    <p className="mb-2 font-medium text-zinc-900">Created</p>
                    <p>Books: {result.created_counts.books}</p>
                    <p>Nodes: {result.created_counts.nodes}</p>
                    <p>Summaries: {result.created_counts.summaries}</p>
                    <p>Problems: {result.created_counts.problems}</p>
                  </div>
                  <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm">
                    <p className="mb-2 font-medium text-zinc-900">Filtered</p>
                    <p>Summaries invalid: {result.filtered_counts.summaries_invalid}</p>
                    <p>Problems invalid: {result.filtered_counts.problems_invalid}</p>
                  </div>
                </div>
                <Link
                  className="inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                  href={`/?book_id=${result.book_id}`}
                >
                  Open book
                </Link>
              </div>
            ) : null}

            <button
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
              onClick={() => void onGenerate()}
              disabled={loading}
              type="button"
            >
              {loading ? (
                <span
                  aria-hidden
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                />
              ) : null}
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
