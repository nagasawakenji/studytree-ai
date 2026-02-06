"use client";

import { useState } from "react";

import type { Book } from "../../lib/api";

type BooksSidebarProps = {
  books: Book[];
  booksLoading: boolean;
  booksError: string | null;
  primaryBookId: string | number | null;
  secondaryBookId: string | number | null;
  onSelectPrimary: (bookId: string | number | null) => void;
  onSelectSecondary: (bookId: string | number | null) => void;
  onRefreshBooks: () => void;
  onCreateBook: (title: string) => Promise<boolean>;
};

export const BooksSidebar = ({
  books,
  booksLoading,
  booksError,
  primaryBookId,
  secondaryBookId,
  onSelectPrimary,
  onSelectSecondary,
  onRefreshBooks,
  onCreateBook,
}: BooksSidebarProps) => {
  const [title, setTitle] = useState("");

  const handleCreate = async () => {
    if (!title.trim()) {
      return;
    }
    const created = await onCreateBook(title.trim());
    if (created) {
      setTitle("");
    }
  };

  const primaryBook = books.find(
    (book) => String(book.id) === String(primaryBookId),
  );
  const secondaryBook = books.find(
    (book) => String(book.id) === String(secondaryBookId),
  );

  return (
    <aside className="flex w-full max-w-xs flex-col border-r border-zinc-800 bg-zinc-900 p-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">StudyTree</h1>
        <p className="text-xs text-zinc-400">Notes + dual trees</p>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Books
          </h2>
          <button
            className="text-xs text-zinc-400 underline"
            type="button"
            onClick={onRefreshBooks}
          >
            Refresh
          </button>
        </div>
        {booksLoading ? (
          <p className="text-xs text-zinc-400">Loading books...</p>
        ) : null}
        {booksError ? <p className="text-xs text-red-400">{booksError}</p> : null}
        <div className="space-y-2">
          {books.map((book, index) => {
            const isPrimary =
              primaryBookId !== null &&
              String(primaryBookId) === String(book.id);
            const isSecondary =
              secondaryBookId !== null &&
              String(secondaryBookId) === String(book.id);
            return (
              <div
                key={book.id ?? `${book.title}-${index}`}
                className={`rounded-md border px-3 py-2 text-sm ${
                  isPrimary || isSecondary
                    ? "border-zinc-500 bg-zinc-800"
                    : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <button
                  className="w-full text-left font-medium text-zinc-100"
                  type="button"
                  onClick={() => onSelectPrimary(book.id ?? null)}
                >
                  {book.title}
                </button>
                <p className="text-xs text-zinc-500">id: {book.id ?? "-"}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-100"
                    type="button"
                    onClick={() => onSelectPrimary(book.id ?? null)}
                  >
                    Primary
                  </button>
                  <button
                    className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-100"
                    type="button"
                    onClick={() => onSelectSecondary(book.id ?? null)}
                  >
                    Secondary
                  </button>
                  {(isPrimary || isSecondary) && (
                    <button
                      className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
                      type="button"
                      onClick={() => {
                        if (isPrimary) {
                          onSelectPrimary(null);
                        }
                        if (isSecondary) {
                          onSelectSecondary(null);
                        }
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          New note
        </h2>
        <input
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
          placeholder="Type a title..."
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-400"
          type="button"
          onClick={() => void handleCreate()}
          disabled={booksLoading || !title.trim()}
        >
          {booksLoading ? "Creating..." : "Create"}
        </button>
      </div>

      <div className="mt-6 space-y-2 text-xs text-zinc-400">
        <p>
          Primary: <span className="text-zinc-200">{primaryBook?.title ?? "None"}</span>
        </p>
        <p>
          Secondary: <span className="text-zinc-200">{secondaryBook?.title ?? "None"}</span>
        </p>
      </div>
    </aside>
  );
};
