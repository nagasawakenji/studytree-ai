export type Book = {
  id?: string | number;
  title: string;
};

const API_PREFIX = "/api/v1";

type BooksResponse = Book[] | { data?: Book[] };

async function parseBooksResponse(response: Response): Promise<Book[]> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const data = (await response.json()) as BooksResponse;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}

export async function listBooks(): Promise<Book[]> {
  const response = await fetch(`${API_PREFIX}/books`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return parseBooksResponse(response);
}

export async function createBook(title: string): Promise<Book> {
  const response = await fetch(`${API_PREFIX}/books`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as Book;
}
