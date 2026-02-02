"use client";

import { useCallback, useEffect, useState } from "react";

import { createBook, listBooks, type Book } from "../lib/api";

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    setError(null);
    try {
      const data = await listBooks();
      setBooks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load books");
    }
  }, []);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  const handleCreate = async () => {
    if (!title.trim()) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createBook(title.trim());
      setTitle("");
      await loadBooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create book");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 rounded-2xl bg-white p-8 shadow-sm">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Books</h1>
          <p className="text-sm text-zinc-500">
            Fetching from the Go API via /api/v1/books.
          </p>
        </header>

        <section className="space-y-3">
          <label className="text-sm font-medium" htmlFor="book-title">
            New book title
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="book-title"
              className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-zinc-400 focus:outline-none"
              placeholder="Type a title..."
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <button
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-zinc-400"
              onClick={handleCreate}
              disabled={loading || !title.trim()}
              type="button"
            >
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-600">Book list</h2>
          <ul className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm">
            {books.length === 0 ? (
              <li className="text-zinc-500">No books yet.</li>
            ) : (
              books.map((book, index) => (
                <li
                  key={book.id ?? `${book.title}-${index}`}
                  className="rounded-md bg-white px-3 py-2 shadow-sm"
                >
                  {book.title}
                </li>
              ))
            )}
          </ul>
          <button
            className="text-xs text-zinc-500 underline"
            type="button"
            onClick={() => void loadBooks()}
          >
            Refresh list
          </button>
        </section>
      </main>
    </div>
  );
}
