"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getProblem, type Problem } from "@/lib/api";
import { MarkdownContent } from "@/lib/markdown";

type PageProps = {
  params: Promise<{
    problemId: string;
  }>;
};

type ContentShape = Record<string, unknown>;

const pickString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export default function ProblemDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { problemId } = React.use(params);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!problemId) {
      setError("Problem ID is missing.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getProblem(problemId);
        if (!cancelled) {
          setProblem(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load problem.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [problemId]);

  const content = useMemo(() => {
    return (problem?.content ?? {}) as ContentShape;
  }, [problem]);

  const title =
    pickString(content.title) ??
    (typeof problem?.content?.title === "string" && problem.content.title) ??
    "Untitled problem";

  const body =
    pickString(content.body_md) ||
    pickString(content.stem_md) ||
    pickString(content.body) ||
    pickString(content.stem) ||
    "";

  const answer =
    pickString(content.answer_md) ||
    pickString(content.answer) ||
    "";

  const explanation =
    pickString(content.explanation_md) ||
    pickString(content.explanation) ||
    "";

  const errorStatus = error?.match(/\b(4\d{2}|5\d{2})\b/)?.[1];
  const errorLabel =
    errorStatus === "404"
      ? "Problem not found (404)"
      : "Something went wrong (500)";

  return (
    <div className="min-h-screen bg-neutral-50 text-zinc-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-white"
            type="button"
            onClick={() => router.back()}
          >
            Back
          </button>
          <Link className="text-sm text-zinc-500 underline" href="/">
            Home
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-500">Loading problem...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
            <p className="text-sm font-semibold">{errorLabel}</p>
            <p className="mt-2 text-xs text-red-600">{error}</p>
          </div>
        ) : problem ? (
          <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                <span>problem_id: {problem.id ?? "-"}</span>
                <span>node_id: {problem.node_id ?? "-"}</span>
                <span>kind: {problem.kind ?? "qa"}</span>
                {problem.updated_at ? (
                  <span>updated: {problem.updated_at}</span>
                ) : null}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Problem</h2>
              {body ? (
                <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                  <MarkdownContent
                    className="text-base leading-7"
                    content={body}
                  />
                </div>
              ) : (
                <p className="mt-2 text-sm text-zinc-400">
                  No body content.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-700">Answer</h2>
                {answer ? (
                  <button
                    className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                    type="button"
                    onClick={() => setShowAnswer((prev) => !prev)}
                  >
                    {showAnswer ? "Hide answer" : "Show answer"}
                  </button>
                ) : null}
              </div>
              {answer ? (
                showAnswer ? (
                  <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <MarkdownContent
                      className="text-base leading-7"
                      content={answer}
                      tone="answer"
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-zinc-400">
                    Answer is hidden.
                  </p>
                )
              ) : (
                <p className="mt-2 text-sm text-zinc-400">
                  No answer provided.
                </p>
              )}
            </div>

            {explanation ? (
              <div>
                <h2 className="text-sm font-semibold text-zinc-700">
                  Explanation
                </h2>
                <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                  <MarkdownContent
                    className="text-base leading-7"
                    content={explanation}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-500">Problem not found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
