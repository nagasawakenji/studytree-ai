"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type WheelEvent,
} from "react";

import {
  createBook,
  createNode,
  createProblem,
  listAllNodes,
  listBooks,
  listProblems,
  moveSubtree,
  type Book,
  type BookNode,
  type ProblemSummary,
} from "../lib/api";
import { buildGraphLayout } from "../lib/graphLayout";

type Slot = "primary" | "secondary";

type DragPayload = {
  nodeId?: string | number;
  bookId?: string | number;
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

const GRAPH_NODE_WIDTH = 200;
const GRAPH_NODE_HEIGHT = 72;

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const usePanZoom = () => {
  const [viewport, setViewport] = useState<Viewport>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const panRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const onMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-node-card='true']")) {
        return;
      }
      panRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        baseX: viewport.x,
        baseY: viewport.y,
      };
      const handleMove = (moveEvent: MouseEvent) => {
        if (!panRef.current) {
          return;
        }
        const { baseX, baseY, startX, startY } = panRef.current;
        setViewport((prev) => ({
          ...prev,
          x: baseX + (moveEvent.clientX - startX),
          y: baseY + (moveEvent.clientY - startY),
        }));
      };
      const handleUp = () => {
        panRef.current = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [viewport.x, viewport.y],
  );

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = -event.deltaY * 0.001;
    setViewport((prev) => {
      const nextScale = clamp(prev.scale + delta, 0.5, 2);
      return { ...prev, scale: nextScale };
    });
  }, []);

  return { viewport, setViewport, onMouseDown, onWheel };
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

  const [chapterPopover, setChapterPopover] = useState<{
    slot: Slot;
    title: string;
  } | null>(null);
  const [inlineChapter, setInlineChapter] = useState<{
    slot: Slot;
    x: number;
    y: number;
    title: string;
  } | null>(null);
  const [draggingNode, setDraggingNode] = useState<{
    slot: Slot;
    nodeId: string | number;
  } | null>(null);
  const [dragOverNode, setDragOverNode] = useState<{
    slot: Slot;
    nodeId: string | number;
  } | null>(null);
  const [rootDragActive, setRootDragActive] = useState<Slot | null>(null);

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

  const primaryLayout = useMemo(
    () =>
      buildGraphLayout(primaryNodes, {
        nodeWidth: GRAPH_NODE_WIDTH,
        nodeHeight: GRAPH_NODE_HEIGHT,
      }),
    [primaryNodes],
  );
  const secondaryLayout = useMemo(
    () =>
      buildGraphLayout(secondaryNodes, {
        nodeWidth: GRAPH_NODE_WIDTH,
        nodeHeight: GRAPH_NODE_HEIGHT,
      }),
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
    activeSlot === "primary"
      ? primaryNodes
      : activeSlot === "secondary"
        ? secondaryNodes
        : [];
  const activeNode = getNodeById(activeNodes, activeNodeId);
  const {
    viewport: primaryViewport,
    setViewport: setPrimaryViewport,
    onMouseDown: onPrimaryMouseDown,
    onWheel: onPrimaryWheel,
  } = usePanZoom();
  const {
    viewport: secondaryViewport,
    setViewport: setSecondaryViewport,
    onMouseDown: onSecondaryMouseDown,
    onWheel: onSecondaryWheel,
  } = usePanZoom();
  const primaryCanvasRef = useRef<HTMLDivElement | null>(null);
  const secondaryCanvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPrimaryViewport({ x: 0, y: 0, scale: 1 });
  }, [primaryBookId, setPrimaryViewport]);

  useEffect(() => {
    setSecondaryViewport({ x: 0, y: 0, scale: 1 });
  }, [secondaryBookId, setSecondaryViewport]);

  useEffect(() => {
    setChapterPopover((prev) => (prev?.slot === "primary" ? null : prev));
    setInlineChapter((prev) => (prev?.slot === "primary" ? null : prev));
  }, [primaryBookId]);

  useEffect(() => {
    setChapterPopover((prev) => (prev?.slot === "secondary" ? null : prev));
    setInlineChapter((prev) => (prev?.slot === "secondary" ? null : prev));
  }, [secondaryBookId]);

  const getRootCount = useCallback(
    (slot: Slot) => {
      const nodes = slot === "primary" ? primaryNodes : secondaryNodes;
      return nodes.filter(
        (node) => node.parent_id === null || node.parent_id === undefined,
      ).length;
    },
    [primaryNodes, secondaryNodes],
  );

  const handleCreateChapter = useCallback(
    async (slot: Slot, rawTitle: string) => {
      const titleValue = rawTitle.trim();
      const bookId = slot === "primary" ? primaryBookId : secondaryBookId;
      const setError =
        slot === "primary" ? setPrimaryNodesError : setSecondaryNodesError;

      if (!bookId || !titleValue) {
        return;
      }

      setError(null);
      try {
        await createNode(bookId, {
          parent_id: null,
          order_index: getRootCount(slot),
          title: titleValue,
        });
        await refreshBookNodes(bookId);
        setChapterPopover((prev) => (prev?.slot === slot ? null : prev));
        setInlineChapter((prev) => (prev?.slot === slot ? null : prev));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create chapter",
        );
      }
    },
    [
      getRootCount,
      primaryBookId,
      refreshBookNodes,
      secondaryBookId,
    ],
  );

  const handleCanvasDoubleClick = useCallback(
    (slot: Slot, event: MouseEvent<HTMLDivElement>) => {
      const bookId = slot === "primary" ? primaryBookId : secondaryBookId;
      if (!bookId) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-node-card='true']")) {
        return;
      }
      const container =
        slot === "primary"
          ? primaryCanvasRef.current
          : secondaryCanvasRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      setInlineChapter({
        slot,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        title: "",
      });
      setChapterPopover(null);
    },
    [primaryBookId, secondaryBookId],
  );

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

      <main className="flex-1 bg-neutral-50 p-8 text-zinc-900">
        <div className="mx-auto flex h-full max-w-6xl flex-col gap-6">
          <header className="space-y-1">
            <h2 className="text-2xl font-semibold">Dual Book Trees</h2>
            <p className="text-sm text-zinc-500">
              Drag a node across books to reparent. Click a node to open
              problems instantly.
            </p>
          </header>

          <div
            className={`grid gap-6 ${
              secondaryBookId ? "lg:grid-cols-2" : "lg:grid-cols-1"
            }`}
          >
            <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Primary tree</h3>
                  <p className="text-xs text-zinc-500">
                    {primaryBook?.title ?? "Select a book"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <button
                      className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
                      type="button"
                      onClick={() =>
                        setChapterPopover({ slot: "primary", title: "" })
                      }
                      disabled={!primaryBookId}
                    >
                      + Chapter
                    </button>
                    {chapterPopover?.slot === "primary" ? (
                      <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
                        <input
                          className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-xs"
                          placeholder="Chapter title"
                          value={chapterPopover.title}
                          onChange={(event) =>
                            setChapterPopover({
                              slot: "primary",
                              title: event.target.value,
                            })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              void handleCreateChapter(
                                "primary",
                                chapterPopover.title,
                              );
                            }
                            if (event.key === "Escape") {
                              setChapterPopover(null);
                            }
                          }}
                        />
                        <button
                          className="mt-2 w-full rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                          type="button"
                          onClick={() =>
                            void handleCreateChapter(
                              "primary",
                              chapterPopover.title,
                            )
                          }
                          disabled={!chapterPopover.title.trim()}
                        >
                          Create
                        </button>
                      </div>
                    ) : null}
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
              </div>

              <div
                ref={primaryCanvasRef}
                className="relative h-[420px] overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 text-sm"
                onDragOver={(event) => {
                  event.preventDefault();
                  const target = event.target as HTMLElement | null;
                  if (target?.closest("[data-node-card='true']")) {
                    if (rootDragActive === "primary") {
                      setRootDragActive(null);
                    }
                    return;
                  }
                  setRootDragActive("primary");
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget === event.target) {
                    setRootDragActive(null);
                  }
                }}
                onDrop={(event) => {
                  const target = event.target as HTMLElement | null;
                  setRootDragActive(null);
                  if (target?.closest("[data-node-card='true']")) {
                    return;
                  }
                  handleDropNode(
                    event,
                    primaryBookId,
                    null,
                    setPrimaryNodesError,
                  );
                }}
                onDoubleClick={(event) =>
                  handleCanvasDoubleClick("primary", event)
                }
              >
                {rootDragActive === "primary" ? (
                  <div className="pointer-events-none absolute inset-0 z-10 rounded-xl bg-indigo-100/60" />
                ) : null}
                {primaryBookId === null ? (
                  <div className="flex h-full items-center justify-center text-zinc-500">
                    Select a book to view nodes.
                  </div>
                ) : primaryNodesLoading && primaryNodes.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-zinc-500">
                    Loading nodes...
                  </div>
                ) : primaryNodes.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-zinc-500">
                    No nodes yet.
                  </div>
                ) : (
                  <div
                    className="absolute inset-0"
                    onMouseDown={onPrimaryMouseDown}
                    onWheel={onPrimaryWheel}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        transform: `translate(${primaryViewport.x}px, ${primaryViewport.y}px) scale(${primaryViewport.scale})`,
                        transformOrigin: "0 0",
                      }}
                    >
                      <svg
                        className="absolute left-0 top-0"
                        width={primaryLayout.width}
                        height={primaryLayout.height}
                      >
                        {primaryLayout.edges.map((edge) => {
                          const startX =
                            edge.from.x + GRAPH_NODE_WIDTH / 2;
                          const startY = edge.from.y + GRAPH_NODE_HEIGHT;
                          const endX = edge.to.x + GRAPH_NODE_WIDTH / 2;
                          const endY = edge.to.y;
                          return (
                            <line
                              key={`${edge.from.id}-${edge.to.id}`}
                              x1={startX}
                              y1={startY}
                              x2={endX}
                              y2={endY}
                              stroke="#e5e7eb"
                              strokeWidth={2}
                            />
                          );
                        })}
                      </svg>
                      {primaryLayout.nodes.map((graphNode) => {
                        const isSelected =
                          primarySelectedNodeId !== null &&
                          String(primarySelectedNodeId) === graphNode.id;
                        const isDragging =
                          draggingNode?.slot === "primary" &&
                          String(draggingNode.nodeId) === graphNode.id;
                        const isDropTarget =
                          dragOverNode?.slot === "primary" &&
                          String(dragOverNode.nodeId) === graphNode.id;
                        return (
                          <button
                            key={graphNode.id}
                            data-node-card="true"
                            className={`absolute rounded-xl border px-4 py-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-neutral-400 ${
                              isSelected
                                ? "border-neutral-900 bg-neutral-900 text-white"
                                : "border-neutral-200 bg-white text-zinc-900 hover:bg-neutral-50"
                            } ${
                              isDragging
                                ? "scale-[1.02] shadow-lg"
                                : "hover:shadow-md"
                            } ${
                              isDropTarget && !isSelected
                                ? "ring-2 ring-indigo-300 bg-indigo-50"
                                : ""
                            }`}
                            style={{
                              left: graphNode.x,
                              top: graphNode.y,
                              width: GRAPH_NODE_WIDTH,
                              height: GRAPH_NODE_HEIGHT,
                            }}
                            type="button"
                            draggable={Boolean(graphNode.node.id && primaryBookId)}
                            onDragStart={(event) => {
                              if (!graphNode.node.id || !primaryBookId) {
                                return;
                              }
                              setDraggingNode({
                                slot: "primary",
                                nodeId: graphNode.node.id,
                              });
                              event.dataTransfer.setData(
                                "application/json",
                                JSON.stringify({
                                  nodeId: graphNode.node.id,
                                  bookId: primaryBookId,
                                }),
                              );
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              setDraggingNode(null);
                              setDragOverNode(null);
                              setRootDragActive(null);
                            }}
                            onClick={() => {
                              if (
                                graphNode.node.id !== undefined &&
                                graphNode.node.id !== null
                              ) {
                                setPrimarySelectedNodeId(graphNode.node.id);
                                openProblemsModal(
                                  "primary",
                                  graphNode.node.id,
                                );
                              }
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              setRootDragActive(null);
                              if (
                                graphNode.node.id === null ||
                                graphNode.node.id === undefined
                              ) {
                                return;
                              }
                              setDragOverNode({
                                slot: "primary",
                                nodeId: graphNode.node.id,
                              });
                            }}
                            onDragLeave={() => {
                              setDragOverNode((prev) =>
                                prev?.slot === "primary" &&
                                String(prev.nodeId) === graphNode.id
                                  ? null
                                  : prev,
                              );
                            }}
                            onDrop={(event) => {
                              setDragOverNode(null);
                              handleDropNode(
                                event,
                                primaryBookId,
                                graphNode.node.id ?? null,
                                setPrimaryNodesError,
                              );
                            }}
                          >
                            <div className="text-sm font-semibold">
                              {graphNode.node.title}
                            </div>
                            <div className="text-[11px] text-neutral-400">
                              id: {graphNode.node.id ?? "-"}
                            </div>
                          </button>
                        );
                      })}
                      {inlineChapter?.slot === "primary" ? (
                        <div
                          className="absolute z-20"
                          style={{
                            left: inlineChapter.x,
                            top: inlineChapter.y,
                          }}
                        >
                          <input
                            className="w-52 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs shadow-lg"
                            placeholder="New chapter"
                            autoFocus
                            value={inlineChapter.title}
                            onChange={(event) =>
                              setInlineChapter({
                                slot: "primary",
                                x: inlineChapter.x,
                                y: inlineChapter.y,
                                title: event.target.value,
                              })
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                void handleCreateChapter(
                                  "primary",
                                  inlineChapter.title,
                                );
                              }
                              if (event.key === "Escape") {
                                setInlineChapter(null);
                              }
                            }}
                            onBlur={() => setInlineChapter(null)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
              {primaryNodesError ? (
                <p className="text-xs text-red-600">{primaryNodesError}</p>
              ) : null}
            </section>

            {secondaryBookId ? (
              <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Secondary tree</h3>
                    <p className="text-xs text-zinc-500">
                      {secondaryBook?.title ?? "Select a book"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <button
                        className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
                        type="button"
                        onClick={() =>
                          setChapterPopover({ slot: "secondary", title: "" })
                        }
                        disabled={!secondaryBookId}
                      >
                        + Chapter
                      </button>
                      {chapterPopover?.slot === "secondary" ? (
                        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
                          <input
                            className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-xs"
                            placeholder="Chapter title"
                            value={chapterPopover.title}
                            onChange={(event) =>
                              setChapterPopover({
                                slot: "secondary",
                                title: event.target.value,
                              })
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                void handleCreateChapter(
                                  "secondary",
                                  chapterPopover.title,
                                );
                              }
                              if (event.key === "Escape") {
                                setChapterPopover(null);
                              }
                            }}
                          />
                          <button
                            className="mt-2 w-full rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                            type="button"
                            onClick={() =>
                              void handleCreateChapter(
                                "secondary",
                                chapterPopover.title,
                              )
                            }
                            disabled={!chapterPopover.title.trim()}
                          >
                            Create
                          </button>
                        </div>
                      ) : null}
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
                </div>

                <div
                  ref={secondaryCanvasRef}
                  className="relative h-[420px] overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 text-sm"
                  onDragOver={(event) => {
                    event.preventDefault();
                    const target = event.target as HTMLElement | null;
                    if (target?.closest("[data-node-card='true']")) {
                      if (rootDragActive === "secondary") {
                        setRootDragActive(null);
                      }
                      return;
                    }
                    setRootDragActive("secondary");
                  }}
                  onDragLeave={(event) => {
                    if (event.currentTarget === event.target) {
                      setRootDragActive(null);
                    }
                  }}
                  onDrop={(event) => {
                    const target = event.target as HTMLElement | null;
                    setRootDragActive(null);
                    if (target?.closest("[data-node-card='true']")) {
                      return;
                    }
                    handleDropNode(
                      event,
                      secondaryBookId,
                      null,
                      setSecondaryNodesError,
                    );
                  }}
                  onDoubleClick={(event) =>
                    handleCanvasDoubleClick("secondary", event)
                  }
                >
                  {rootDragActive === "secondary" ? (
                    <div className="pointer-events-none absolute inset-0 z-10 rounded-xl bg-indigo-100/60" />
                  ) : null}
                  {secondaryBookId === null ? (
                    <div className="flex h-full items-center justify-center text-zinc-500">
                      Select a book to view nodes.
                    </div>
                  ) : secondaryNodesLoading && secondaryNodes.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-zinc-500">
                      Loading nodes...
                    </div>
                  ) : secondaryNodes.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-zinc-500">
                      No nodes yet.
                    </div>
                  ) : (
                    <div
                      className="absolute inset-0"
                      onMouseDown={onSecondaryMouseDown}
                      onWheel={onSecondaryWheel}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          transform: `translate(${secondaryViewport.x}px, ${secondaryViewport.y}px) scale(${secondaryViewport.scale})`,
                          transformOrigin: "0 0",
                        }}
                      >
                        <svg
                          className="absolute left-0 top-0"
                          width={secondaryLayout.width}
                          height={secondaryLayout.height}
                        >
                          {secondaryLayout.edges.map((edge) => {
                            const startX =
                              edge.from.x + GRAPH_NODE_WIDTH / 2;
                            const startY = edge.from.y + GRAPH_NODE_HEIGHT;
                            const endX = edge.to.x + GRAPH_NODE_WIDTH / 2;
                            const endY = edge.to.y;
                            return (
                              <line
                                key={`${edge.from.id}-${edge.to.id}`}
                                x1={startX}
                                y1={startY}
                                x2={endX}
                                y2={endY}
                                stroke="#e5e7eb"
                                strokeWidth={2}
                              />
                            );
                          })}
                        </svg>
                        {secondaryLayout.nodes.map((graphNode) => {
                          const isSelected =
                            secondarySelectedNodeId !== null &&
                            String(secondarySelectedNodeId) === graphNode.id;
                          const isDragging =
                            draggingNode?.slot === "secondary" &&
                            String(draggingNode.nodeId) === graphNode.id;
                          const isDropTarget =
                            dragOverNode?.slot === "secondary" &&
                            String(dragOverNode.nodeId) === graphNode.id;
                          return (
                            <button
                              key={graphNode.id}
                              data-node-card="true"
                              className={`absolute rounded-xl border px-4 py-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-neutral-400 ${
                                isSelected
                                  ? "border-neutral-900 bg-neutral-900 text-white"
                                  : "border-neutral-200 bg-white text-zinc-900 hover:bg-neutral-50"
                              } ${
                                isDragging
                                  ? "scale-[1.02] shadow-lg"
                                  : "hover:shadow-md"
                              } ${
                                isDropTarget && !isSelected
                                  ? "ring-2 ring-indigo-300 bg-indigo-50"
                                  : ""
                              }`}
                              style={{
                                left: graphNode.x,
                                top: graphNode.y,
                                width: GRAPH_NODE_WIDTH,
                                height: GRAPH_NODE_HEIGHT,
                              }}
                              type="button"
                              draggable={Boolean(
                                graphNode.node.id && secondaryBookId,
                              )}
                              onDragStart={(event) => {
                                if (!graphNode.node.id || !secondaryBookId) {
                                  return;
                                }
                                setDraggingNode({
                                  slot: "secondary",
                                  nodeId: graphNode.node.id,
                                });
                                event.dataTransfer.setData(
                                  "application/json",
                                  JSON.stringify({
                                    nodeId: graphNode.node.id,
                                    bookId: secondaryBookId,
                                  }),
                                );
                                event.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                setDraggingNode(null);
                                setDragOverNode(null);
                                setRootDragActive(null);
                              }}
                              onClick={() => {
                                if (
                                  graphNode.node.id !== undefined &&
                                  graphNode.node.id !== null
                                ) {
                                  setSecondarySelectedNodeId(
                                    graphNode.node.id,
                                  );
                                  openProblemsModal(
                                    "secondary",
                                    graphNode.node.id,
                                  );
                                }
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                setRootDragActive(null);
                                if (
                                  graphNode.node.id === null ||
                                  graphNode.node.id === undefined
                                ) {
                                  return;
                                }
                                setDragOverNode({
                                  slot: "secondary",
                                  nodeId: graphNode.node.id,
                                });
                              }}
                              onDragLeave={() => {
                                setDragOverNode((prev) =>
                                  prev?.slot === "secondary" &&
                                  String(prev.nodeId) === graphNode.id
                                    ? null
                                    : prev,
                                );
                              }}
                              onDrop={(event) => {
                                setDragOverNode(null);
                                handleDropNode(
                                  event,
                                  secondaryBookId,
                                  graphNode.node.id ?? null,
                                  setSecondaryNodesError,
                                );
                              }}
                            >
                              <div className="text-sm font-semibold">
                                {graphNode.node.title}
                              </div>
                              <div className="text-[11px] text-neutral-400">
                                id: {graphNode.node.id ?? "-"}
                              </div>
                            </button>
                          );
                        })}
                        {inlineChapter?.slot === "secondary" ? (
                          <div
                            className="absolute z-20"
                            style={{
                              left: inlineChapter.x,
                              top: inlineChapter.y,
                            }}
                          >
                            <input
                              className="w-52 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs shadow-lg"
                              placeholder="New chapter"
                              autoFocus
                              value={inlineChapter.title}
                              onChange={(event) =>
                                setInlineChapter({
                                  slot: "secondary",
                                  x: inlineChapter.x,
                                  y: inlineChapter.y,
                                  title: event.target.value,
                                })
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  void handleCreateChapter(
                                    "secondary",
                                    inlineChapter.title,
                                  );
                                }
                                if (event.key === "Escape") {
                                  setInlineChapter(null);
                                }
                              }}
                              onBlur={() => setInlineChapter(null)}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
                {secondaryNodesError ? (
                  <p className="text-xs text-red-600">{secondaryNodesError}</p>
                ) : null}
              </section>
            ) : null}
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
