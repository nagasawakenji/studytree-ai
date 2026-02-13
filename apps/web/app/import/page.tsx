"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createImport } from "@/lib/api";

export default function ImportPage() {
  const router = useRouter();
  const [bookTitle, setBookTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [maxDepth, setMaxDepth] = useState(3);
  const [problemsPerLeaf, setProblemsPerLeaf] = useState(3);
  const [language, setLanguage] = useState("ja");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGenerate = async () => {
    if (!bookTitle.trim() || !sourceText.trim()) {
      setError("book title and source text are required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await createImport({
        book_title: bookTitle.trim(),
        source_text: sourceText.trim(),
        options: {
          max_depth: maxDepth,
          problems_per_leaf: problemsPerLeaf,
          language: language.trim() || "ja",
        },
      });
      router.push(`/?book_id=${result.book_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to import");
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

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
              onClick={() => void onGenerate()}
              disabled={loading}
              type="button"
            >
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
