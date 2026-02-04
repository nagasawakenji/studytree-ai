"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";

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

type Slot = "primary" | "secondary";

type DragPayload = {
  nodeId?: string | number;
  bookId?: string | number;
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

const getBookById = (
  books: Book[],
  bookId: string | number | null,
): Book | undefined => {
  if (bookId === null) {
    return undefined;
  }
  return books.find((book) => String(book.id) === String(bookId));
};

const renderTree = (
  tree: TreeData,
  selectedNodeId: string | number | null,
  bookId: string | number | null,
  onSelect: (nodeId: string | number) => void,
  onDrop: (
    event: DragEvent<HTMLButtonElement | HTMLDivElement>,
    dstParentId: string | number | null,
  ) => void,
): JSX.Element | null => {
  const renderNodes = (parentKey: string, depth: number): JSX.Element | null => {
    const children = tree.childrenMap.get(parentKey);
    if (!children || children.length === 0) {
      return null;
    }

    return (
      <ul className="space-y-2">
        {children.map((node) => {
          const nodeKey = node.id ?? `${node.title}-${node.parent_id ?? "root"}`;
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
                onDrop={(event) => onDrop(event, node.id ?? null)}
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

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [title, setTitle] = useState("");
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);

  const [primaryBookId, setPrimaryBookId] = useState<string | number | null>(
    null,
  );
  const [secondaryBookId, setSecondaryBookId] = useState<
    string | number | null
  >(null);

  const [primaryNodes, setPrimaryNodes] = useState<BookNode[]>([]);
  const [primaryNodesLoading, setPrimaryNodesLoading] = useState(false);
  const [primaryNodesError, setPrimaryNodesError] = useState<string | null>(null);
  const [primarySelectedNodeId, setPrimarySelectedNodeId] = useState<
    string | number | null
  >(null);

  const [secondaryNodes, setSecondaryNodes] = useState<BookNode[]>([]);
  const [secondaryNodesLoading, setSecondaryNodesLoading] = useState(false);
  const [secondaryNodesError, setSecondaryNodesError] = useState<
    string | null
  >(null);
  const [secondarySelectedNodeId, setSecondarySelectedNodeId] = useState<
    string | number | null
  >(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | number | null>(null);
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);

  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [problemsLoading, setProblemsLoading] = useState(false);
  const [problemsError, setProblemsError] = useState<string | null>(null);
  const [problemTitle, setProblemTitle] = useState("");
  const [problemBody, setProblemBody] = useState("");
  const [problemSaving, setProblemSaving] = useState(false);

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

  const loadNodes = useCallback(async (bookId: string | number, slot: Slot) => {
    if (slot === "primary") {
      setPrimaryNodesError(null);
      setPrimaryNodesLoading(true);
    } else {
      setSecondaryNodesError(null);
      setSecondaryNodesLoading(true);
    }

    try {
      const data = await listAllNodes(bookId);
      if (slot === "primary") {
        setPrimaryNodes(data);
      } else {
        setSecondaryNodes(data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load nodes";
      if (slot === "primary") {
        setPrimaryNodesError(message);
      } else {
        setSecondaryNodesError(message);
      }
    } finally {
      if (slot === "primary") {
        setPrimaryNodesLoading(false);
      } else {
        setSecondaryNodesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (primaryBookId === null) {
      setPrimaryNodes([]);
      setPrimarySelectedNodeId(null);
      return;
    }

    void loadNodes(primaryBookId, "primary");
  }, [primaryBookId, loadNodes]);

  useEffect(() => {
    if (secondaryBookId === null) {
      setSecondaryNodes([]);
      setSecondarySelectedNodeId(null);
      return;
    }

    void loadNodes(secondaryBookId, "secondary");
  }, [secondaryBookId, loadNodes]);

  const loadProblems = useCallback(async (nodeId: string | number) => {
    setProblemsError(null);
    setProblemsLoading(true);
    try {
      const data = await listProblems(nodeId);
      setProblems(data);
    } catch (err) {
      setProblemsError(
        err instanceof Error ? err.message : "Failed to load problems",
      );
    } finally {
      setProblemsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!modalOpen || !activeNodeId) {
      return;
    }

    void loadProblems(activeNodeId);
  }, [activeNodeId, loadProblems, modalOpen]);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [modalOpen]);

  const refreshBookNodes = useCallback(
    async (bookId: string | number) => {
      if (primaryBookId !== null && String(bookId) === String(primaryBookId)) {
        await loadNodes(primaryBookId, "primary");
      }
      if (
        secondaryBookId !== null &&
        String(bookId) === String(secondaryBookId)
      ) {
        await loadNodes(secondaryBookId, "secondary");
      }
    },
    [loadNodes, primaryBookId, secondaryBookId],
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

      let parsed: DragPayload = {};
      try {
        parsed = JSON.parse(raw) as DragPayload;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid drag data");
        return;
      }

      if (!parsed.nodeId || !parsed.bookId) {
        return;
      }

      if (
        String(parsed.bookId) === String(dstBookId) &&
        String(parsed.nodeId) === String(dstParentId)
      ) {
        setError("Cannot move a node onto itself.");
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
          primaryBookId !== null &&
          String(parsed.bookId) === String(primaryBookId) &&
          String(primarySelectedNodeId) === String(parsed.nodeId)
        ) {
          setPrimarySelectedNodeId(null);
        }
        if (
          secondaryBookId !== null &&
          String(parsed.bookId) === String(secondaryBookId) &&
          String(secondarySelectedNodeId) === String(parsed.nodeId)
        ) {
          setSecondarySelectedNodeId(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move node");
        await Promise.all([
          refreshBookNodes(parsed.bookId),
          refreshBookNodes(dstBookId),
        ]);
      }
    },
    [
      primaryBookId,
      primarySelectedNodeId,
      refreshBookNodes,
      secondaryBookId,
      secondarySelectedNodeId,
    ],
  );

  const primaryTree = useMemo(() => buildTreeData(primaryNodes), [primaryNodes]);
  const secondaryTree = useMemo(
    () => buildTreeData(secondaryNodes),
    [secondaryNodes],
  );

  const openProblemsModal = useCallback(
    (slot: Slot, nodeId: string | number) => {
      setActiveSlot(slot);
      setActiveNodeId(nodeId);
      setModalOpen(true);
      setProblems([]);
      setProblemsError(null);
      setProblemTitle("");
      setProblemBody("");
    },
    [],
  );

  const handleProblemSubmit = useCallback(async () => {
    if (!activeNodeId || !problemTitle.trim() || !problemBody.trim()) {
      return;
    }

    setProblemSaving(true);
    setProblemsError(null);
    try {
      await createProblem(activeNodeId, {
        title: problemTitle.trim(),
        body: problemBody.trim(),
      });
      setProblemTitle("");
      setProblemBody("");
      await loadProblems(activeNodeId);
    } catch (err) {
      setProblemsError(
        err instanceof Error ? err.message : "Failed to add problem",
      );
    } finally {
      setProblemSaving(false);
    }
  }, [activeNodeId, loadProblems, problemBody, problemTitle]);

  const primaryBook = getBookById(books, primaryBookId);
  const secondaryBook = getBookById(books, secondaryBookId);
  const activeNodes =
    activeSlot === "primary" ? primaryNodes : activeSlot === "secondary" ? secondaryNodes : [];
  const activeNode = getNodeById(activeNodes, activeNodeId);

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
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
              onClick={() => void loadBooks()}
            >
              Refresh
            </button>
          </div>
          {booksLoading ? (
            <p className="text-xs text-zinc-400">Loading books...</p>
          ) : null}
          {booksError ? (
            <p className="text-xs text-red-400">{booksError}</p>
          ) : null}
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
                    onClick={() => setPrimaryBookId(book.id ?? null)}
                  >
                    {book.title}
                  </button>
                  <p className="text-xs text-zinc-500">id: {book.id ?? "-"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-100"
                      type="button"
                      onClick={() => setPrimaryBookId(book.id ?? null)}
                    >
                      Primary
                    </button>
                    <button
                      className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-100"
                      type="button"
                      onClick={() => setSecondaryBookId(book.id ?? null)}
                    >
                      Secondary
                    </button>
                    {(isPrimary || isSecondary) && (
                      <button
                        className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
                        type="button"
                        onClick={() => {
                          if (isPrimary) {
                            setPrimaryBookId(null);
                          }
                          if (isSecondary) {
                            setSecondaryBookId(null);
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
            onClick={handleCreate}
            disabled={booksLoading || !title.trim()}
          >
            {booksLoading ? "Creating..." : "Create"}
          </button>
        </div>

        <div className="mt-6 space-y-2 text-xs text-zinc-400">
          <p>
            Primary:{" "}
            <span className="text-zinc-200">
              {primaryBook?.title ?? "None"}
            </span>
          </p>
          <p>
            Secondary:{" "}
            <span className="text-zinc-200">
              {secondaryBook?.title ?? "None"}
            </span>
          </p>
        </div>
      </aside>

      <main className="flex-1 bg-zinc-50 p-8 text-zinc-900">
        <div className="mx-auto flex h-full max-w-6xl flex-col gap-6">
          <header className="space-y-1">
            <h2 className="text-2xl font-semibold">Dual Book Trees</h2>
            <p className="text-sm text-zinc-500">
              Drag a node across books to reparent. Click a node to open
              problems instantly.
            </p>
          </header>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Primary tree</h3>
                  <p className="text-xs text-zinc-500">
                    {primaryBook?.title ?? "Select a book"}
                  </p>
                </div>
                {primaryBookId ? (
                  <button
                    className="text-xs text-zinc-500 underline"
                    type="button"
                    onClick={() =>
                      primaryBookId && void loadNodes(primaryBookId, "primary")
                    }
                  >
                    Refresh nodes
                  </button>
                ) : null}
              </div>

              <div
                className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-500"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) =>
                  handleDropNode(event, primaryBookId, null, setPrimaryNodesError)
                }
              >
                Root drop area
              </div>

              <div className="min-h-[320px] rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm">
                {primaryBookId === null ? (
                  <p className="text-zinc-500">Select a book to view nodes.</p>
                ) : primaryNodesLoading && primaryNodes.length === 0 ? (
                  <p className="text-zinc-500">Loading nodes...</p>
                ) : primaryNodes.length === 0 ? (
                  <p className="text-zinc-500">No nodes yet.</p>
                ) : (
                  renderTree(
                    primaryTree,
                    primarySelectedNodeId,
                    primaryBookId,
                    (nodeId) => {
                      setPrimarySelectedNodeId(nodeId);
                      openProblemsModal("primary", nodeId);
                    },
                    (event, dstParentId) =>
                      handleDropNode(
                        event,
                        primaryBookId,
                        dstParentId,
                        setPrimaryNodesError,
                      ),
                  )
                )}
              </div>
              {primaryNodesError ? (
                <p className="text-xs text-red-600">{primaryNodesError}</p>
              ) : null}
            </section>

            <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Secondary tree</h3>
                  <p className="text-xs text-zinc-500">
                    {secondaryBook?.title ?? "Select a book"}
                  </p>
                </div>
                {secondaryBookId ? (
                  <button
                    className="text-xs text-zinc-500 underline"
                    type="button"
                    onClick={() =>
                      secondaryBookId &&
                      void loadNodes(secondaryBookId, "secondary")
                    }
                  >
                    Refresh nodes
                  </button>
                ) : null}
              </div>

              <div
                className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-500"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) =>
                  handleDropNode(
                    event,
                    secondaryBookId,
                    null,
                    setSecondaryNodesError,
                  )
                }
              >
                Root drop area
              </div>

              <div className="min-h-[320px] rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm">
                {secondaryBookId === null ? (
                  <p className="text-zinc-500">Select a book to view nodes.</p>
                ) : secondaryNodesLoading && secondaryNodes.length === 0 ? (
                  <p className="text-zinc-500">Loading nodes...</p>
                ) : secondaryNodes.length === 0 ? (
                  <p className="text-zinc-500">No nodes yet.</p>
                ) : (
                  renderTree(
                    secondaryTree,
                    secondarySelectedNodeId,
                    secondaryBookId,
                    (nodeId) => {
                      setSecondarySelectedNodeId(nodeId);
                      openProblemsModal("secondary", nodeId);
                    },
                    (event, dstParentId) =>
                      handleDropNode(
                        event,
                        secondaryBookId,
                        dstParentId,
                        setSecondaryNodesError,
                      ),
                  )
                )}
              </div>
              {secondaryNodesError ? (
                <p className="text-xs text-red-600">{secondaryNodesError}</p>
              ) : null}
            </section>
          </div>
        </div>
      </main>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 text-zinc-900 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">Problems</h3>
                <p className="text-xs text-zinc-500">
                  {activeNode?.title ?? "Untitled node"} · id: {activeNodeId ?? "-"}
                </p>
              </div>
              <button
                className="text-sm text-zinc-500"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-zinc-600">
                  Existing problems
                </h4>
                {problemsLoading ? (
                  <p className="text-xs text-zinc-500">Loading problems...</p>
                ) : problems.length === 0 ? (
                  <p className="text-xs text-zinc-500">No problems yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {problems.map((problem, index) => (
                      <li
                        key={problem.problem_id ?? `problem-${index}`}
                        className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2"
                      >
                        <p className="text-sm font-medium text-zinc-900">
                          {problem.intent ?? "Untitled problem"}
                        </p>
                        <p className="text-xs text-zinc-500">
                          id: {problem.problem_id ?? "-"} ·{problem.format ?? "format"} ·
                          {problem.difficulty ?? "difficulty"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {problemsError ? (
                  <p className="text-xs text-red-600">{problemsError}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-zinc-600">
                  Add problem
                </h4>
                <input
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Problem title"
                  value={problemTitle}
                  onChange={(event) => setProblemTitle(event.target.value)}
                />
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Problem body"
                  value={problemBody}
                  onChange={(event) => setProblemBody(event.target.value)}
                />
                <button
                  className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
                  type="button"
                  onClick={() => void handleProblemSubmit()}
                  disabled={
                    problemSaving ||
                    !problemTitle.trim() ||
                    !problemBody.trim() ||
                    !activeNodeId
                  }
                >
                  {problemSaving ? "Saving..." : "Add problem"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
