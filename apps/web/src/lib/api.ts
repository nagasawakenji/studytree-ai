export type Book = {
  id: number | string;
  title: string;
};

const basePath = "/api/v1/books";

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listBooks(): Promise<Book[]> {
  return requestJson<Book[]>(basePath);
}

export async function createBook(title: string): Promise<Book> {
  return requestJson<Book>(basePath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
}
