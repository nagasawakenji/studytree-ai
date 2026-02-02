import { useEffect, useState } from "react";

import { createBook, listBooks, type Book } from "../lib/api";

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBooks = async () => {
    try {
      setError(null);
      const data = await listBooks();
      setBooks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load books");
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await createBook(title.trim());
      setTitle("");
      await fetchBooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create book");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1 style={{ marginBottom: "1rem" }}>Books</h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="New book title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          style={{ flex: 1, padding: "0.5rem" }}
        />
        <button type="submit" disabled={loading} style={{ padding: "0.5rem 1rem" }}>
          {loading ? "Saving..." : "Add"}
        </button>
      </form>

      {error && (
        <p style={{ color: "crimson", marginBottom: "1rem" }}>{error}</p>
      )}

      <ul style={{ paddingLeft: "1.25rem" }}>
        {books.map((book) => (
          <li key={book.id}>{book.title}</li>
        ))}
      </ul>
    </main>
  );
}
