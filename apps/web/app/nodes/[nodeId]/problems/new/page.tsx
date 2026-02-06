"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createProblem } from "../../../../../lib/api";

type PageProps = {
  params: Promise<{
    nodeId: string;
  }>;
};

export default function NewProblemPage({ params }: PageProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [answerMd, setAnswerMd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedParams = use(params);
  const nodeId = resolvedParams?.nodeId;

  const handleSubmit = async () => {
    if (!nodeId || !title.trim()) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createProblem(nodeId, {
        title: title.trim(),
        bodyMd: bodyMd.trim(),
        answerMd: answerMd.trim(),
      });
      if (created?.id !== undefined && created?.id !== null) {
        router.push(`/problems/${created.id}`);
        return;
      }
      setError("Problem created, but the response was missing an id.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create problem");
    } finally {
      setSaving(false);
    }
  };

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
            Back to nodes
          </Link>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">
                New problem
              </h1>
              <p className="mt-1 text-xs text-zinc-500">node id: {nodeId}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Title
              </label>
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Problem title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Body (Markdown)
              </label>
              <textarea
                className="min-h-[160px] w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Problem body"
                value={bodyMd}
                onChange={(event) => setBodyMd(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Answer (Markdown)
              </label>
              <textarea
                className="min-h-[120px] w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Answer"
                value={answerMd}
                onChange={(event) => setAnswerMd(event.target.value)}
              />
            </div>

            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving || !title.trim() || !nodeId}
            >
              {saving ? "Saving..." : "Create problem"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
