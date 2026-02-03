"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";

import {
  createBook,
  createNode,
  listBooks,
  listNodes,
  patchNode,
  reorderNodes,
  type Book,
  type BookNode,
} from "../lib/api";

type ParentKey = "root" | string;

type DragOverState =
  | { type: "between"; parentId: ParentKey; index: number }
  | { type: "node"; nodeId: string }
  | null;

const normalizeParentId = (value: BookNode["parent_id"]): ParentKey =>
  value === null || value === undefined ? "root" : String(value);

const normalizeNodeId = (value: BookNode["id"]): string => String(value ?? "");

const getNodeIdValue = (node: BookNode): string | number =>
  node.id ?? normalizeNodeId(node.id);

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [bookTitle, setBookTitle] = useState("");
  const [selectedBookId, setSelectedBookId] = useState<string | number | null>(
    null,
  );
  const [nodes, setNodes] = useState<BookNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [problemTitle, setProblemTitle] = useState("");
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOverState, setDragOverState] = useState<DragOverState>(null);

  const loadBooks = useCallback(async () => {
    setBooksError(null);
    try {
      const data = await listBooks();
      setBooks(data);
    } catch (err) {
      setBooksError(err instanceof Error ? err.message : "Failed to load books");
    }
  }, []);

  const fetchAllNodes = useCallback(async (bookId: string | number) => {
    const collected: BookNode[] = [];
    const visited = new Set<string>();

    const fetchByParent = async (parentId: ParentKey) => {
      const response = await listNodes(bookId, parentId);
      for (const node of response) {
        if (node.id === undefined || node.id === null) {
          continue;
        }
        const key = normalizeNodeId(node.id);
        if (visited.has(key)) {
          continue;
        }
        visited.add(key);
        collected.push(node);
      }
      await Promise.all(
        response
          .filter((node) => node.id !== undefined && node.id !== null)
          .map((node) => fetchByParent(normalizeNodeId(node.id))),
      );
    };

    await fetchByParent("root");
    return collected;
  }, []);

  const loadNodes = useCallback(
    async (bookId: string | number) => {
      setNodesError(null);
      setNodesLoading(true);
      try {
        const data = await fetchAllNodes(bookId);
        setNodes(data);
      } catch (err) {
        setNodesError(err instanceof Error ? err.message : "Failed to load nodes");
      } finally {
        setNodesLoading(false);
      }
    },
    [fetchAllNodes],
  );

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    if (selectedBookId === null) {
      setNodes([]);
      setSelectedNodeId(null);
      return;
    }

    void loadNodes(selectedBookId);
  }, [loadNodes, selectedBookId]);

  const handleCreateBook = async () => {
    if (!bookTitle.trim()) {
      return;
    }

    setBooksLoading(true);
    setBooksError(null);
    try {
      await createBook(bookTitle.trim());
      setBookTitle("");
      await loadBooks();
    } catch (err) {
      setBooksError(err instanceof Error ? err.message : "Failed to create book");
    } finally {
      setBooksLoading(false);
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
    const childrenMap = new Map<ParentKey, BookNode[]>();

    for (const node of sortedNodes) {
      const key = normalizeParentId(node.parent_id);
      if (!childrenMap.has(key)) {
        childrenMap.set(key, []);
      }
      childrenMap.get(key)?.push(node);
    }

    return { childrenMap };
  }, [sortedNodes]);

  const getChildren = useCallback(
    (parentId: ParentKey) => nodeTree.childrenMap.get(parentId) ?? [],
    [nodeTree.childrenMap],
  );

  const findNodeById = useCallback(
    (nodeId: string) =>
      nodes.find((node) => normalizeNodeId(node.id) === nodeId) ?? null,
    [nodes],
  );

  const getDescendants = useCallback(
    (nodeId: string) => {
      const descendants = new Set<string>();
      const stack = [nodeId];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
          continue;
        }
        const children = getChildren(current);
        for (const child of children) {
          const childId = normalizeNodeId(child.id);
          if (!descendants.has(childId)) {
            descendants.add(childId);
            stack.push(childId);
          }
        }
      }
      return descendants;
    },
    [getChildren],
  );

  const updateOrderIndexes = useCallback(
    (
      currentNodes: BookNode[],
      parentId: ParentKey,
      orderedIds: Array<string | number>,
    ) => {
      const orderMap = new Map<string, number>();
      orderedIds.forEach((id, index) => {
        orderMap.set(String(id), index);
      });

      return currentNodes.map((node) => {
        const nodeParent = normalizeParentId(node.parent_id);
        if (nodeParent !== parentId) {
          return node;
        }
        const nodeId = normalizeNodeId(node.id);
        if (!orderMap.has(nodeId)) {
          return node;
        }
        return { ...node, order_index: orderMap.get(nodeId) ?? 0 };
      });
    },
  );

  const handleCreateChapter = async () => {
    if (!chapterTitle.trim() || selectedBookId === null) {
      return;
    }

    setNodesLoading(true);
    setNodesError(null);
    const rootChildren = getChildren("root");

    try {
      await createNode(selectedBookId, {
        title: chapterTitle.trim(),
        parent_id: null,
        order_index: rootChildren.length,
      });
      setChapterTitle("");
      await loadNodes(selectedBookId);
    } catch (err) {
      setNodesError(err instanceof Error ? err.message : "Failed to add chapter");
    } finally {
      setNodesLoading(false);
    }
  };

  const handleCreateProblem = async () => {
    if (!problemTitle.trim() || selectedBookId === null || !selectedNodeId) {
      return;
    }

    setNodesLoading(true);
    setNodesError(null);
    const selectedNode = findNodeById(selectedNodeId);
    const parentId = selectedNode ? getNodeIdValue(selectedNode) : selectedNodeId;
    const children = getChildren(selectedNodeId);

    try {
      await createNode(selectedBookId, {
        title: problemTitle.trim(),
        parent_id: parentId,
        order_index: children.length,
      });
      setProblemTitle("");
      await loadNodes(selectedBookId);
    } catch (err) {
      setNodesError(
        err instanceof Error ? err.message : "Failed to add problem",
      );
    } finally {
      setNodesLoading(false);
    }
  };

  const handleReorderWithinParent = async (
    parentId: ParentKey,
    targetIndex: number,
  ) => {
    if (!draggingNodeId || selectedBookId === null) {
      return;
    }

    const siblings = getChildren(parentId).filter(
      (node) => normalizeNodeId(node.id) !== draggingNodeId,
    );
    const movedNode = findNodeById(draggingNodeId);
    if (!movedNode) {
      return;
    }
    const movedParentId = normalizeParentId(movedNode.parent_id);
    if (movedParentId !== parentId) {
      return;
    }

    const newSiblings = [...siblings];
    const insertIndex = Math.min(Math.max(targetIndex, 0), newSiblings.length);
    newSiblings.splice(insertIndex, 0, movedNode);
    const orderedIds = newSiblings
      .map((node) => getNodeIdValue(node))
      .filter((id): id is string | number => id !== undefined && id !== null);

    const previousNodes = nodes;
    const optimistic = updateOrderIndexes(nodes, parentId, orderedIds);
    setNodes(optimistic);

    try {
      await reorderNodes(selectedBookId, parentId, orderedIds);
    } catch (err) {
      setNodes(previousNodes);
      setNodesError(
        err instanceof Error ? err.message : "Failed to reorder nodes",
      );
    }
  };

  const handleMoveToParent = async (targetParentId: string) => {
    if (!draggingNodeId || selectedBookId === null) {
      return;
    }

    const movingNode = findNodeById(draggingNodeId);
    if (!movingNode) {
      return;
    }

    if (draggingNodeId === targetParentId) {
      return;
    }

    const descendants = getDescendants(draggingNodeId);
    if (descendants.has(targetParentId)) {
      setNodesError("Cannot move a node into its own descendant.");
      return;
    }

    const fromParentId = normalizeParentId(movingNode.parent_id);
    const targetNode = findNodeById(targetParentId);
    const toParentId = targetParentId;

    const fromSiblings = getChildren(fromParentId).filter(
      (node) => normalizeNodeId(node.id) !== draggingNodeId,
    );
    const toSiblings = getChildren(toParentId).filter(
      (node) => normalizeNodeId(node.id) !== draggingNodeId,
    );

    const newToSiblings = [movingNode, ...toSiblings];

    const fromOrderedIds = fromSiblings
      .map((node) => getNodeIdValue(node))
      .filter((id): id is string | number => id !== undefined && id !== null);
    const toOrderedIds = newToSiblings
      .map((node) => getNodeIdValue(node))
      .filter((id): id is string | number => id !== undefined && id !== null);

    const previousNodes = nodes;
    let optimistic = nodes.map((node) => {
      if (normalizeNodeId(node.id) !== draggingNodeId) {
        return node;
      }
      return { ...node, parent_id: targetParentId, order_index: 0 };
    });
    optimistic = updateOrderIndexes(optimistic, fromParentId, fromOrderedIds);
    optimistic = updateOrderIndexes(optimistic, toParentId, toOrderedIds);
    setNodes(optimistic);

    try {
      await patchNode(selectedBookId, getNodeIdValue(movingNode), {
        parent_id: targetNode ? getNodeIdValue(targetNode) : targetParentId,
        order_index: 0,
      });
      if (fromOrderedIds.length > 0) {
        await reorderNodes(selectedBookId, fromParentId, fromOrderedIds);
      } else {
        await reorderNodes(selectedBookId, fromParentId, []);
      }
      await reorderNodes(selectedBookId, toParentId, toOrderedIds);
    } catch (err) {
      setNodes(previousNodes);
      setNodesError(
        err instanceof Error ? err.message : "Failed to move node",
      );
    }
  };

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    nodeId: string,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId);
    setDraggingNodeId(nodeId);
  };

  const handleDragEnd = () => {
    setDraggingNodeId(null);
    setDragOverState(null);
  };

  const renderNodes = (parentId: ParentKey, depth: number): JSX.Element => {
    const children = getChildren(parentId);

    return (
      <ul className="space-y-2">
        {children.map((node, index) => {
          const nodeId = normalizeNodeId(node.id);
          const isSelected = selectedNodeId === nodeId;
          const isDragging = draggingNodeId === nodeId;
          const showBetweenIndicator =
            dragOverState?.type === "between" &&
            dragOverState.parentId === parentId &&
            dragOverState.index === index;

          return (
            <li key={nodeId} className="space-y-2">
              <div
                className={`h-1 rounded-full transition ${
                  showBetweenIndicator
                    ? "bg-emerald-400"
                    : "bg-transparent"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverState({
                    type: "between",
                    parentId,
                    index,
                  });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleReorderWithinParent(parentId, index);
                  setDragOverState(null);
                }}
              />
              <div
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm shadow-sm transition ${
                  isSelected
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-zinc-200 bg-white"
                } ${isDragging ? "opacity-50" : ""}`}
                style={{ marginLeft: `${depth * 18}px` }}
                draggable
                onDragStart={(event) => handleDragStart(event, nodeId)}
                onDragEnd={handleDragEnd}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverState({ type: "node", nodeId });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingNodeId) {
                    void handleMoveToParent(nodeId);
                  }
                  setDragOverState(null);
                }}
              >
                <button
                  className="flex flex-1 flex-col text-left"
                  type="button"
                  onClick={() => setSelectedNodeId(nodeId)}
                >
                  <span className="font-medium text-zinc-900">
                    {node.title}
                  </span>
                  <span className="text-xs text-zinc-500">
                    id: {node.id ?? "-"}
                  </span>
                </button>
                <span
                  className={`ml-3 text-[10px] font-semibold uppercase tracking-wide ${
                    dragOverState?.type === "node" &&
                    dragOverState.nodeId === nodeId
                      ? "text-emerald-500"
                      : "text-zinc-400"
                  }`}
                >
                  Drop to nest
                </span>
              </div>
              {renderNodes(nodeId, depth + 1)}
            </li>
          );
        })}
        <li>
          <div
            className={`h-1 rounded-full transition ${
              dragOverState?.type === "between" &&
              dragOverState.parentId === parentId &&
              dragOverState.index === children.length
                ? "bg-emerald-400"
                : "bg-transparent"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverState({
                type: "between",
                parentId,
                index: children.length,
              });
            }}
            onDrop={(event) => {
              event.preventDefault();
              void handleReorderWithinParent(parentId, children.length);
              setDragOverState(null);
            }}
          />
        </li>
      </ul>
    );
  };

  const selectedChildren = selectedNodeId
    ? getChildren(selectedNodeId)
    : [];

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 rounded-2xl bg-white p-8 shadow-sm">
        <header className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">StudyTree MVP</h1>
            <p className="text-sm text-zinc-500">
              Manage books, chapters, and problems with drag-and-drop.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="min-w-[200px] flex-1">
              <label
                className="text-xs font-semibold uppercase text-zinc-500"
                htmlFor="book-select"
              >
                Select book
              </label>
              <select
                id="book-select"
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={selectedBookId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedBookId(value ? value : null);
                  setSelectedNodeId(null);
                }}
              >
                <option value="">Choose a book</option>
                {books.map((book, index) => {
                  const bookId = book.id ?? `${book.title}-${index}`;
                  return (
                    <option key={bookId} value={String(book.id ?? "")}>
                      {book.title}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="min-w-[220px] flex-1">
              <label
                className="text-xs font-semibold uppercase text-zinc-500"
                htmlFor="new-book"
              >
                New book
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="new-book"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Book title"
                  value={bookTitle}
                  onChange={(event) => setBookTitle(event.target.value)}
                />
                <button
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-zinc-400"
                  onClick={handleCreateBook}
                  disabled={booksLoading || !bookTitle.trim()}
                  type="button"
                >
                  {booksLoading ? "Saving" : "Create"}
                </button>
              </div>
            </div>
            <div>
              <button
                className="text-xs text-zinc-500 underline"
                type="button"
                onClick={() => void loadBooks()}
              >
                Refresh list
              </button>
            </div>
            {booksError ? (
              <p className="w-full text-sm text-red-600">{booksError}</p>
            ) : null}
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          <section className="space-y-6">
            <div className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <h2 className="text-sm font-semibold text-zinc-700">Tree Pane</h2>
              <div className="space-y-2">
                <label
                  className="text-xs font-semibold uppercase text-zinc-500"
                  htmlFor="new-chapter"
                >
                  New chapter (root node)
                </label>
                <div className="flex gap-2">
                  <input
                    id="new-chapter"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Chapter title"
                    value={chapterTitle}
                    onChange={(event) => setChapterTitle(event.target.value)}
                    disabled={!selectedBookId}
                  />
                  <button
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-emerald-200"
                    onClick={handleCreateChapter}
                    disabled={!selectedBookId || !chapterTitle.trim()}
                    type="button"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-600">
                  Chapter tree
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
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-sm">
                {selectedBookId === null ? (
                  <p className="text-zinc-500">
                    Select a book to view its tree.
                  </p>
                ) : nodesLoading && nodes.length === 0 ? (
                  <p className="text-zinc-500">Loading nodes...</p>
                ) : nodes.length === 0 ? (
                  <p className="text-zinc-500">No chapters yet.</p>
                ) : (
                  renderNodes("root", 0)
                )}
              </div>
              {nodesError ? (
                <p className="text-sm text-red-600">{nodesError}</p>
              ) : null}
            </div>
          </section>

          <section className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-zinc-900">
                Detail Pane
              </h2>
              <p className="text-sm text-zinc-500">
                {selectedNodeId
                  ? "Selected chapter problems appear immediately."
                  : "Click a chapter to view its problems."}
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-700">
                  Problems for {selectedNodeId ? `#${selectedNodeId}` : "-"}
                </h3>
              </div>
              <div className="space-y-2">
                <label
                  className="text-xs font-semibold uppercase text-zinc-500"
                  htmlFor="new-problem"
                >
                  + Problem
                </label>
                <div className="flex gap-2">
                  <input
                    id="new-problem"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Problem title"
                    value={problemTitle}
                    onChange={(event) => setProblemTitle(event.target.value)}
                    disabled={!selectedNodeId}
                  />
                  <button
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-zinc-400"
                    onClick={handleCreateProblem}
                    disabled={!selectedNodeId || !problemTitle.trim()}
                    type="button"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-zinc-100 bg-white p-3">
                {selectedNodeId === null ? (
                  <p className="text-sm text-zinc-500">
                    Select a chapter to see its problems.
                  </p>
                ) : selectedChildren.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No problems yet for this chapter.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedChildren.map((node) => (
                      <li
                        key={normalizeNodeId(node.id)}
                        className="rounded-md border border-zinc-100 px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-zinc-900">
                          {node.title}
                        </p>
                        <p className="text-xs text-zinc-500">
                          id: {node.id ?? "-"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
