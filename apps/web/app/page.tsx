"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createBook,
  createNode,
  listBooks,
  listNodes,
  type Book,
  type BookNode,
} from "../lib/api";

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [title, setTitle] = useState("");
  const [selectedBookId, setSelectedBookId] = useState<string | number | null>(
    null,
  );
  const [nodes, setNodes] = useState<BookNode[]>([]);
  const [nodeTitle, setNodeTitle] = useState("");
  const [nodeParentId, setNodeParentId] = useState("");
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesError, setNodesError] = useState<string | null>(null);
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

  const loadNodes = useCallback(
    async (bookId: string | number) => {
      setNodesError(null);
      setNodesLoading(true);
      try {
        const data = await listNodes(bookId);
        setNodes(data);
      } catch (err) {
        setNodesError(err instanceof Error ? err.message : "Failed to load nodes");
      } finally {
        setNodesLoading(false);
      }
    },
    [setNodes],
  );

  useEffect(() => {
    if (selectedBookId === null) {
      setNodes([]);
      return;
    }

    void loadNodes(selectedBookId);
  }, [loadNodes, selectedBookId]);

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

  const handleCreateNode = async () => {
    if (!nodeTitle.trim() || selectedBookId === null) {
      return;
    }

    setNodesError(null);
    setNodesLoading(true);
    const parentValue = nodeParentId.trim();
    const payload = {
      title: nodeTitle.trim(),
      ...(parentValue ? { parent_id: parentValue } : {}),
    };

    try {
      await createNode(selectedBookId, payload);
      setNodeTitle("");
      setNodeParentId("");
      await loadNodes(selectedBookId);
    } catch (err) {
      setNodesError(err instanceof Error ? err.message : "Failed to create node");
    } finally {
      setNodesLoading(false);
    }
  };

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      const orderA = Number(a.order_index ?? 0);
      const orderB = Number(b.order_index ?? 0);
      return orderA - orderB;
    });
  }, [nodes]);

  const nodeTree = useMemo(() => {
    const childrenMap = new Map<string, BookNode[]>();
    const normalizeKey = (value: BookNode["parent_id"]) =>
      value === null || value === undefined ? "root" : String(value);

    for (const node of sortedNodes) {
      const key = normalizeKey(node.parent_id);
      if (!childrenMap.has(key)) {
        childrenMap.set(key, []);
      }
      childrenMap.get(key)?.push(node);
    }

    return { childrenMap, normalizeKey };
  }, [sortedNodes]);

  const renderNodes = (
    parentKey: string,
    depth: number,
  ): JSX.Element | null => {
    const children = nodeTree.childrenMap.get(parentKey);
    if (!children || children.length === 0) {
      return null;
    }

    return (
      <ul className="space-y-2">
        {children.map((node) => {
          const nodeKey =
            node.id ?? `${node.title}-${node.parent_id ?? "root"}`;
          const childKey = nodeTree.normalizeKey(node.id);
          return (
            <li key={nodeKey} className="space-y-2">
              <div
                className="rounded-md border border-zinc-100 bg-white px-3 py-2 text-sm shadow-sm"
                style={{ marginLeft: `${depth * 16}px` }}
              >
                <p className="font-medium text-zinc-900">{node.title}</p>
                <p className="text-xs text-zinc-500">
                  id: {node.id ?? "-"} / parent: {node.parent_id ?? "root"}
                </p>
              </div>
              {renderNodes(childKey, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 rounded-2xl bg-white p-8 shadow-sm">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Books & Nodes</h1>
          <p className="text-sm text-zinc-500">
            Fetching from the Go API via /api/v1/books.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <section className="space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-medium" htmlFor="book-title">
                New book title
              </label>
              <div className="flex flex-col gap-3">
                <input
                  id="book-title"
                  className="w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-zinc-400 focus:outline-none"
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
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-600">Book list</h2>
              <ul className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm">
                {books.length === 0 ? (
                  <li className="text-zinc-500">No books yet.</li>
                ) : (
                  books.map((book, index) => {
                    const bookId = book.id ?? `${book.title}-${index}`;
                    const isSelected = selectedBookId === book.id;
                    return (
                      <li key={bookId}>
                        <button
                          className={`w-full rounded-md px-3 py-2 text-left shadow-sm transition ${
                            isSelected
                              ? "bg-zinc-900 text-white"
                              : "bg-white text-zinc-900 hover:bg-zinc-100"
                          }`}
                          type="button"
                          onClick={() =>
                            setSelectedBookId(
                              book.id ?? `${book.title}-${index}`,
                            )
                          }
                        >
                          {book.title}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              <button
                className="text-xs text-zinc-500 underline"
                type="button"
                onClick={() => void loadBooks()}
              >
                Refresh list
              </button>
            </div>
          </section>

          <section className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-zinc-900">
                Nodes
                {selectedBookId ? (
                  <span className="ml-2 text-xs font-medium text-zinc-500">
                    for book {selectedBookId}
                  </span>
                ) : null}
              </h2>
              <p className="text-sm text-zinc-500">
                {selectedBookId
                  ? "Select a node parent to build the tree."
                  : "Select a book to load nodes."}
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <h3 className="text-sm font-semibold text-zinc-600">Add node</h3>
              <div className="flex flex-col gap-3">
                <input
                  className="w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                  placeholder="Node title"
                  value={nodeTitle}
                  onChange={(event) => setNodeTitle(event.target.value)}
                  disabled={!selectedBookId}
                />
                <input
                  className="w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                  placeholder="Parent node id (optional)"
                  value={nodeParentId}
                  onChange={(event) => setNodeParentId(event.target.value)}
                  disabled={!selectedBookId}
                />
                <button
                  className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-zinc-400"
                  onClick={handleCreateNode}
                  disabled={
                    nodesLoading || !selectedBookId || !nodeTitle.trim()
                  }
                  type="button"
                >
                  {nodesLoading ? "Saving..." : "Add node"}
                </button>
              </div>
              {nodesError ? (
                <p className="text-sm text-red-600">{nodesError}</p>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-600">
                  Nodes tree
                </h3>
                {selectedBookId ? (
                  <button
                    className="text-xs text-zinc-500 underline"
                    type="button"
                    onClick={() => void loadNodes(selectedBookId)}
                  >
                    Refresh nodes
                  </button>
                ) : null}
              </div>
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm">
                {selectedBookId === null ? (
                  <p className="text-zinc-500">
                    Select a book to view its nodes.
                  </p>
                ) : nodesLoading && nodes.length === 0 ? (
                  <p className="text-zinc-500">Loading nodes...</p>
                ) : nodes.length === 0 ? (
                  <p className="text-zinc-500">No nodes yet.</p>
                ) : (
                  renderNodes("root", 0)
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
