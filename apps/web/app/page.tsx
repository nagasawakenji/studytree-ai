"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";

import {
  createBook,
  createProblem,
  listAllNodes,
  listBooks,
  listProblems,
  moveSubtree,
  type Book,
  type BookNode,
  type ProblemSummary,
} from "../lib/api";

type TreeData = {
  childrenMap: Map<string, BookNode[]>;
  normalizeKey: (value: BookNode["parent_id"]) => string;
};

const buildTreeData = (nodes: BookNode[]): TreeData => {
  const sortedNodes = [...nodes].sort((a, b) => {
    const orderA = Number(a.order_index ?? 0);
    const orderB = Number(b.order_index ?? 0);
    return orderA - orderB;
  });
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
};

const getNodeById = (
  nodes: BookNode[],
  nodeId: string | number | null,
): BookNode | undefined => {
  if (nodeId === null) {
    return undefined;
  }
  return nodes.find((node) => String(node.id) === String(nodeId));
};

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [title, setTitle] = useState("");
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);

  const [leftBookId, setLeftBookId] = useState<string | number | null>(null);
  const [rightBookId, setRightBookId] = useState<string | number | null>(null);

  const [leftNodes, setLeftNodes] = useState<BookNode[]>([]);
  const [leftNodesLoading, setLeftNodesLoading] = useState(false);
  const [leftNodesError, setLeftNodesError] = useState<string | null>(null);
  const [leftSelectedNodeId, setLeftSelectedNodeId] = useState<
    string | number | null
  >(null);

  const [rightNodes, setRightNodes] = useState<BookNode[]>([]);
  const [rightNodesLoading, setRightNodesLoading] = useState(false);
  const [rightNodesError, setRightNodesError] = useState<string | null>(null);
  const [rightSelectedNodeId, setRightSelectedNodeId] = useState<
    string | number | null
  >(null);

  const [leftProblems, setLeftProblems] = useState<ProblemSummary[]>([]);
  const [leftProblemsLoading, setLeftProblemsLoading] = useState(false);
  const [leftProblemsError, setLeftProblemsError] = useState<string | null>(null);
  const [leftProblemTitle, setLeftProblemTitle] = useState("");
  const [leftProblemBody, setLeftProblemBody] = useState("");
  const [leftProblemSaving, setLeftProblemSaving] = useState(false);

  const [rightProblems, setRightProblems] = useState<ProblemSummary[]>([]);
  const [rightProblemsLoading, setRightProblemsLoading] = useState(false);
  const [rightProblemsError, setRightProblemsError] = useState<string | null>(null);
  const [rightProblemTitle, setRightProblemTitle] = useState("");
  const [rightProblemBody, setRightProblemBody] = useState("");
  const [rightProblemSaving, setRightProblemSaving] = useState(false);

  const loadBooks = useCallback(async () => {
    setBooksError(null);
    setBooksLoading(true);
    try {
      const data = await listBooks();
      setBooks(data);
    } catch (err) {
      setBooksError(err instanceof Error ? err.message : "Failed to load books");
    } finally {
      setBooksLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  const handleCreate = async () => {
    if (!title.trim()) {
      return;
    }

    setBooksLoading(true);
    setBooksError(null);
    try {
      await createBook(title.trim());
      setTitle("");
      await loadBooks();
    } catch (err) {
      setBooksError(err instanceof Error ? err.message : "Failed to create book");
    } finally {
      setBooksLoading(false);
    }
  };

  const loadLeftNodes = useCallback(async (bookId: string | number) => {
    setLeftNodesError(null);
    setLeftNodesLoading(true);
    try {
      const data = await listAllNodes(bookId);
      setLeftNodes(data);
    } catch (err) {
      setLeftNodesError(
        err instanceof Error ? err.message : "Failed to load nodes",
      );
    } finally {
      setLeftNodesLoading(false);
    }
  }, []);

  const loadRightNodes = useCallback(async (bookId: string | number) => {
    setRightNodesError(null);
    setRightNodesLoading(true);
    try {
      const data = await listAllNodes(bookId);
      setRightNodes(data);
    } catch (err) {
      setRightNodesError(
        err instanceof Error ? err.message : "Failed to load nodes",
      );
    } finally {
      setRightNodesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (leftBookId === null) {
      setLeftNodes([]);
      setLeftSelectedNodeId(null);
      setLeftProblems([]);
      setLeftProblemTitle("");
      setLeftProblemBody("");
      return;
    }

    void loadLeftNodes(leftBookId);
  }, [leftBookId, loadLeftNodes]);

  useEffect(() => {
    if (rightBookId === null) {
      setRightNodes([]);
      setRightSelectedNodeId(null);
      setRightProblems([]);
      setRightProblemTitle("");
      setRightProblemBody("");
      return;
    }

    void loadRightNodes(rightBookId);
  }, [rightBookId, loadRightNodes]);

  const loadLeftProblems = useCallback(async (nodeId: string | number) => {
    setLeftProblemsError(null);
    setLeftProblemsLoading(true);
    try {
      const data = await listProblems(nodeId);
      setLeftProblems(data);
    } catch (err) {
      setLeftProblemsError(
        err instanceof Error ? err.message : "Failed to load problems",
      );
    } finally {
      setLeftProblemsLoading(false);
    }
  }, []);

  const loadRightProblems = useCallback(async (nodeId: string | number) => {
    setRightProblemsError(null);
    setRightProblemsLoading(true);
    try {
      const data = await listProblems(nodeId);
      setRightProblems(data);
    } catch (err) {
      setRightProblemsError(
        err instanceof Error ? err.message : "Failed to load problems",
      );
    } finally {
      setRightProblemsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!leftSelectedNodeId) {
      setLeftProblems([]);
      setLeftProblemTitle("");
      setLeftProblemBody("");
      return;
    }

    void loadLeftProblems(leftSelectedNodeId);
  }, [leftSelectedNodeId, loadLeftProblems]);

  useEffect(() => {
    if (!rightSelectedNodeId) {
      setRightProblems([]);
      setRightProblemTitle("");
      setRightProblemBody("");
      return;
    }

    void loadRightProblems(rightSelectedNodeId);
  }, [rightSelectedNodeId, loadRightProblems]);

  const refreshBookNodes = useCallback(
    async (bookId: string | number) => {
      if (leftBookId !== null && String(bookId) === String(leftBookId)) {
        await loadLeftNodes(leftBookId);
      }
      if (rightBookId !== null && String(bookId) === String(rightBookId)) {
        await loadRightNodes(rightBookId);
      }
    },
    [leftBookId, loadLeftNodes, loadRightNodes, rightBookId],
  );

  const handleDropNode = useCallback(
    async (
      event: DragEvent<HTMLButtonElement | HTMLDivElement>,
      dstBookId: string | number | null,
      dstParentId: string | number | null,
      setError: (value: string | null) => void,
    ) => {
      event.preventDefault();
      if (dstBookId === null) {
        return;
      }
      const raw = event.dataTransfer.getData("application/json");
      if (!raw) {
        return;
      }

      let parsed: { nodeId?: string | number; bookId?: string | number } = {};
      try {
        parsed = JSON.parse(raw) as {
          nodeId?: string | number;
          bookId?: string | number;
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid drag data");
        return;
      }

      if (!parsed.nodeId || !parsed.bookId) {
        return;
      }

      setError(null);
      try {
        await moveSubtree({
          srcBookId: parsed.bookId,
          nodeId: parsed.nodeId,
          dstBookId,
          dstParentId,
        });
        await Promise.all([
          refreshBookNodes(parsed.bookId),
          refreshBookNodes(dstBookId),
        ]);
        if (
          leftBookId !== null &&
          String(parsed.bookId) === String(leftBookId) &&
          String(leftSelectedNodeId) === String(parsed.nodeId)
        ) {
          setLeftSelectedNodeId(null);
        }
        if (
          rightBookId !== null &&
          String(parsed.bookId) === String(rightBookId) &&
          String(rightSelectedNodeId) === String(parsed.nodeId)
        ) {
          setRightSelectedNodeId(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move node");
      }
    },
    [
      leftBookId,
      leftSelectedNodeId,
      refreshBookNodes,
      rightBookId,
      rightSelectedNodeId,
    ],
  );

  const leftTree = useMemo(() => buildTreeData(leftNodes), [leftNodes]);
  const rightTree = useMemo(() => buildTreeData(rightNodes), [rightNodes]);

  const handleProblemSubmit = useCallback(
    async (
      nodeId: string | number | null,
      titleValue: string,
      bodyValue: string,
      setSaving: (value: boolean) => void,
      reset: () => void,
      setError: (value: string | null) => void,
      reload: (nodeId: string | number) => Promise<void>,
    ) => {
      if (!nodeId || !titleValue.trim() || !bodyValue.trim()) {
        return;
      }

      setSaving(true);
      setError(null);
      try {
        await createProblem(nodeId, {
          title: titleValue.trim(),
          body: bodyValue.trim(),
        });
        reset();
        await reload(nodeId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add problem");
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const renderTree = (
    tree: TreeData,
    selectedNodeId: string | number | null,
    onSelect: (nodeId: string | number) => void,
    bookId: string | number | null,
    onDrop: (
      event: DragEvent<HTMLButtonElement | HTMLDivElement>,
      dstParentId: string | number | null,
      setError: (value: string | null) => void,
    ) => void,
    setError: (value: string | null) => void,
  ): JSX.Element | null => {
    const renderNodes = (parentKey: string, depth: number): JSX.Element | null => {
      const children = tree.childrenMap.get(parentKey);
      if (!children || children.length === 0) {
        return null;
      }

      return (
        <ul className="space-y-2">
          {children.map((node) => {
            const nodeKey =
              node.id ?? `${node.title}-${node.parent_id ?? "root"}`;
            const childKey = tree.normalizeKey(node.id);
            const isSelected =
              selectedNodeId !== null &&
              String(selectedNodeId) === String(node.id);
            return (
              <li key={nodeKey} className="space-y-2">
                <button
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-zinc-400 ${
                    isSelected
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-100 bg-white text-zinc-900 hover:bg-zinc-50"
                  }`}
                  style={{ marginLeft: `${depth * 16}px` }}
                  type="button"
                  draggable={Boolean(node.id && bookId)}
                  onDragStart={(event) => {
                    if (!node.id || !bookId) {
                      return;
                    }
                    event.dataTransfer.setData(
                      "application/json",
                      JSON.stringify({ nodeId: node.id, bookId }),
                    );
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => {
                    if (node.id !== undefined && node.id !== null) {
                      onSelect(node.id);
                    }
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => onDrop(event, node.id ?? null, setError)}
                >
                  <div className="font-medium">{node.title}</div>
                  <div className="text-xs text-zinc-500">id: {node.id ?? "-"}</div>
                </button>
                {renderNodes(childKey, depth + 1)}
              </li>
            );
          })}
        </ul>
      );
    };

    return renderNodes("root", 0);
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 rounded-2xl bg-white p-8 shadow-sm">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Dual Book Trees</h1>
          <p className="text-sm text-zinc-500">
            Pick books on the left and right to browse nodes and problems.
          </p>
        </header>

        <section className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
          <h2 className="text-sm font-semibold text-zinc-600">Create a book</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              id="book-title"
              className="w-full flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-zinc-400 focus:outline-none"
              placeholder="Type a title..."
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <button
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-zinc-400"
              onClick={handleCreate}
              disabled={booksLoading || !title.trim()}
              type="button"
            >
              {booksLoading ? "Creating..." : "Create"}
            </button>
          </div>
          {booksError ? <p className="text-sm text-red-600">{booksError}</p> : null}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Left book</h2>
                <p className="text-xs text-zinc-500">
                  Drag a chapter to the right book to move it.
                </p>
              </div>
              <button
                className="text-xs text-zinc-500 underline"
                type="button"
                onClick={() => void loadBooks()}
              >
                Refresh books
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-600" htmlFor="left-book">
                Select book
              </label>
              <select
                id="left-book"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={leftBookId === null ? "" : String(leftBookId)}
                onChange={(event) =>
                  setLeftBookId(event.target.value ? event.target.value : null)
                }
                disabled={booksLoading}
              >
                <option value="">Select a book...</option>
                {books.map((book, index) => (
                  <option
                    key={book.id ?? `${book.title}-${index}`}
                    value={book.id ?? `${book.title}-${index}`}
                  >
                    {book.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-600">Nodes</h3>
                  {leftBookId ? (
                    <button
                      className="text-xs text-zinc-500 underline"
                      type="button"
                      onClick={() => leftBookId && void loadLeftNodes(leftBookId)}
                    >
                      Refresh nodes
                    </button>
                  ) : null}
                </div>
                <div
                  className="rounded-lg border border-dashed border-zinc-300 bg-white p-3 text-xs text-zinc-500"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) =>
                    handleDropNode(event, leftBookId, null, setLeftNodesError)
                  }
                >
                  Drop here to move to root
                </div>
                <div className="rounded-lg border border-zinc-100 bg-white p-4 text-sm">
                  {leftBookId === null ? (
                    <p className="text-zinc-500">Select a book to view nodes.</p>
                  ) : leftNodesLoading && leftNodes.length === 0 ? (
                    <p className="text-zinc-500">Loading nodes...</p>
                  ) : leftNodes.length === 0 ? (
                    <p className="text-zinc-500">No nodes yet.</p>
                  ) : (
                    renderTree(
                      leftTree,
                      leftSelectedNodeId,
                      setLeftSelectedNodeId,
                      leftBookId,
                      (event, dstParentId, setError) =>
                        handleDropNode(
                          event,
                          leftBookId,
                          dstParentId,
                          setError,
                        ),
                      setLeftNodesError,
                    )
                  )}
                </div>
                {leftNodesError ? (
                  <p className="text-sm text-red-600">{leftNodesError}</p>
                ) : null}
              </div>

              <div className="space-y-3 rounded-lg border border-zinc-100 bg-white p-4">
                <h3 className="text-sm font-semibold text-zinc-600">Problems</h3>
                {leftBookId === null ? (
                  <p className="text-sm text-zinc-500">
                    Select a book to view problems.
                  </p>
                ) : leftSelectedNodeId === null ? (
                  <p className="text-sm text-zinc-500">
                    Select a chapter to load problems.
                  </p>
                ) : (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-500">Selected node</p>
                      <p className="text-sm font-medium text-zinc-900">
                        {getNodeById(leftNodes, leftSelectedNodeId)?.title ??
                          "Untitled"}
                        <span className="ml-2 text-xs text-zinc-500">
                          id: {leftSelectedNodeId}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-zinc-600">
                        Existing problems
                      </h4>
                      {leftProblemsLoading ? (
                        <p className="text-xs text-zinc-500">Loading problems...</p>
                      ) : leftProblems.length === 0 ? (
                        <p className="text-xs text-zinc-500">No problems yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {leftProblems.map((problem, index) => (
                            <li
                              key={problem.problem_id ?? `problem-${index}`}
                              className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2"
                            >
                              <p className="text-sm font-medium text-zinc-900">
                                {problem.intent ?? "Untitled problem"}
                              </p>
                              <p className="text-xs text-zinc-500">
                                id: {problem.problem_id ?? "-"} ·
                                {problem.format ?? "format"} ·
                                {problem.difficulty ?? "difficulty"}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                      {leftProblemsError ? (
                        <p className="text-xs text-red-600">{leftProblemsError}</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-zinc-600">
                        Add problem
                      </h4>
                      <input
                        className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Problem title"
                        value={leftProblemTitle}
                        onChange={(event) => setLeftProblemTitle(event.target.value)}
                      />
                      <textarea
                        className="min-h-[120px] w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Problem body"
                        value={leftProblemBody}
                        onChange={(event) => setLeftProblemBody(event.target.value)}
                      />
                      <button
                        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
                        type="button"
                        onClick={() =>
                          void handleProblemSubmit(
                            leftSelectedNodeId,
                            leftProblemTitle,
                            leftProblemBody,
                            setLeftProblemSaving,
                            () => {
                              setLeftProblemTitle("");
                              setLeftProblemBody("");
                            },
                            setLeftProblemsError,
                            loadLeftProblems,
                          )
                        }
                        disabled={
                          leftProblemSaving ||
                          !leftProblemTitle.trim() ||
                          !leftProblemBody.trim()
                        }
                      >
                        {leftProblemSaving ? "Saving..." : "Add problem"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Right book</h2>
                <p className="text-xs text-zinc-500">
                  Drop a chapter here to reparent across books.
                </p>
              </div>
              <button
                className="text-xs text-zinc-500 underline"
                type="button"
                onClick={() => void loadBooks()}
              >
                Refresh books
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-600" htmlFor="right-book">
                Select book
              </label>
              <select
                id="right-book"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={rightBookId === null ? "" : String(rightBookId)}
                onChange={(event) =>
                  setRightBookId(event.target.value ? event.target.value : null)
                }
                disabled={booksLoading}
              >
                <option value="">Select a book...</option>
                {books.map((book, index) => (
                  <option
                    key={book.id ?? `${book.title}-${index}`}
                    value={book.id ?? `${book.title}-${index}`}
                  >
                    {book.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-600">Nodes</h3>
                  {rightBookId ? (
                    <button
                      className="text-xs text-zinc-500 underline"
                      type="button"
                      onClick={() => rightBookId && void loadRightNodes(rightBookId)}
                    >
                      Refresh nodes
                    </button>
                  ) : null}
                </div>
                <div
                  className="rounded-lg border border-dashed border-zinc-300 bg-white p-3 text-xs text-zinc-500"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) =>
                    handleDropNode(event, rightBookId, null, setRightNodesError)
                  }
                >
                  Drop here to move to root
                </div>
                <div className="rounded-lg border border-zinc-100 bg-white p-4 text-sm">
                  {rightBookId === null ? (
                    <p className="text-zinc-500">Select a book to view nodes.</p>
                  ) : rightNodesLoading && rightNodes.length === 0 ? (
                    <p className="text-zinc-500">Loading nodes...</p>
                  ) : rightNodes.length === 0 ? (
                    <p className="text-zinc-500">No nodes yet.</p>
                  ) : (
                    renderTree(
                      rightTree,
                      rightSelectedNodeId,
                      setRightSelectedNodeId,
                      rightBookId,
                      (event, dstParentId, setError) =>
                        handleDropNode(
                          event,
                          rightBookId,
                          dstParentId,
                          setError,
                        ),
                      setRightNodesError,
                    )
                  )}
                </div>
                {rightNodesError ? (
                  <p className="text-sm text-red-600">{rightNodesError}</p>
                ) : null}
              </div>

              <div className="space-y-3 rounded-lg border border-zinc-100 bg-white p-4">
                <h3 className="text-sm font-semibold text-zinc-600">Problems</h3>
                {rightBookId === null ? (
                  <p className="text-sm text-zinc-500">
                    Select a book to view problems.
                  </p>
                ) : rightSelectedNodeId === null ? (
                  <p className="text-sm text-zinc-500">
                    Select a chapter to load problems.
                  </p>
                ) : (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-500">Selected node</p>
                      <p className="text-sm font-medium text-zinc-900">
                        {getNodeById(rightNodes, rightSelectedNodeId)?.title ??
                          "Untitled"}
                        <span className="ml-2 text-xs text-zinc-500">
                          id: {rightSelectedNodeId}
                        </span>
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-zinc-600">
                        Existing problems
                      </h4>
                      {rightProblemsLoading ? (
                        <p className="text-xs text-zinc-500">Loading problems...</p>
                      ) : rightProblems.length === 0 ? (
                        <p className="text-xs text-zinc-500">No problems yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {rightProblems.map((problem, index) => (
                            <li
                              key={problem.problem_id ?? `problem-${index}`}
                              className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2"
                            >
                              <p className="text-sm font-medium text-zinc-900">
                                {problem.intent ?? "Untitled problem"}
                              </p>
                              <p className="text-xs text-zinc-500">
                                id: {problem.problem_id ?? "-"} ·
                                {problem.format ?? "format"} ·
                                {problem.difficulty ?? "difficulty"}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                      {rightProblemsError ? (
                        <p className="text-xs text-red-600">{rightProblemsError}</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-zinc-600">
                        Add problem
                      </h4>
                      <input
                        className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Problem title"
                        value={rightProblemTitle}
                        onChange={(event) =>
                          setRightProblemTitle(event.target.value)
                        }
                      />
                      <textarea
                        className="min-h-[120px] w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Problem body"
                        value={rightProblemBody}
                        onChange={(event) => setRightProblemBody(event.target.value)}
                      />
                      <button
                        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
                        type="button"
                        onClick={() =>
                          void handleProblemSubmit(
                            rightSelectedNodeId,
                            rightProblemTitle,
                            rightProblemBody,
                            setRightProblemSaving,
                            () => {
                              setRightProblemTitle("");
                              setRightProblemBody("");
                            },
                            setRightProblemsError,
                            loadRightProblems,
                          )
                        }
                        disabled={
                          rightProblemSaving ||
                          !rightProblemTitle.trim() ||
                          !rightProblemBody.trim()
                        }
                      >
                        {rightProblemSaving ? "Saving..." : "Add problem"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
