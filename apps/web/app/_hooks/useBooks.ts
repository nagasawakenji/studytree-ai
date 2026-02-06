import { useCallback, useEffect, useState } from "react";

import { createBook, listBooks, type Book } from "../../lib/api";

export const useBooks = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    setBooksError(null);
    setBooksLoading(true);
    try {
      const data = await listBooks();
      setBooks(data);
    } catch (err) {
      setBooksError(
        err instanceof Error ? err.message : "Failed to load books",
      );
    } finally {
      setBooksLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  const createBookEntry = useCallback(
    async (title: string) => {
      if (!title.trim()) {
        return false;
      }
      setBooksLoading(true);
      setBooksError(null);
      try {
        await createBook(title.trim());
        await loadBooks();
        return true;
      } catch (err) {
        setBooksError(
          err instanceof Error ? err.message : "Failed to create book",
        );
        return false;
      } finally {
        setBooksLoading(false);
      }
    },
    [loadBooks],
  );

  return {
    books,
    booksLoading,
    booksError,
    loadBooks,
    createBook: createBookEntry,
  };
};
