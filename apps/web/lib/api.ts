export type Book = {
  id?: string | number;
  title: string;
};

export type BookNode = {
  id?: string | number;
  title: string;
  parent_id?: string | number | null;
  order_index?: number | null;
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

type NodesResponse = BookNode[] | { data?: BookNode[] };

async function parseNodesResponse(response: Response): Promise<BookNode[]> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const data = (await response.json()) as NodesResponse;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}

export async function listNodes(bookId: string | number): Promise<BookNode[]> {
  const response = await fetch(`${API_PREFIX}/books/${bookId}/nodes`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return parseNodesResponse(response);
}

export async function createNode(
  bookId: string | number,
  payload: Pick<BookNode, "title" | "parent_id">,
): Promise<BookNode> {
  const response = await fetch(`${API_PREFIX}/books/${bookId}/nodes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as BookNode;
}
