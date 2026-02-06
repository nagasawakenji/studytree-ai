"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type DragEvent,
  type MouseEvent,
} from "react";
import Link from "next/link";

import type { BookNode, Problem } from "../../lib/api";
import type { GraphLayout } from "../../lib/graphLayout";
import { buildGraphLayout } from "../../lib/graphLayout";
import type { ChapterPopoverState, InlineChapterState, Slot } from "../_types";
import { usePanZoom } from "../_hooks/usePanZoom";

type TreeCanvasProps = {
  slot: Slot;
  bookId: string | number | null;
  bookTitle?: string | null;
  nodes: BookNode[];
  nodesLoading: boolean;
  nodesError: string | null;
  selectedNodeId: string | number | null;
  setSelectedNodeId: (value: string | number | null) => void;
  onRefreshNodes: () => void;
  onCreateChapter: (slot: Slot, title: string) => Promise<boolean> | boolean;
  nodeWidth: number;
  nodeHeight: number;
  getExpandedHeight: (slot: Slot, nodeId: string | number) => number;
  chapterPopover: ChapterPopoverState | null;
  setChapterPopover: (value: ChapterPopoverState | null) => void;
  inlineChapter: InlineChapterState | null;
  setInlineChapter: (value: InlineChapterState | null) => void;
  draggingNode: { slot: Slot; nodeId: string | number } | null;
  dragOverNode: { slot: Slot; nodeId: string | number } | null;
  rootDragActive: Slot | null;
  onDragStartNode: (
    slot: Slot,
    nodeId: string | number,
    bookId: string | number | null,
    event: DragEvent<HTMLElement>,
  ) => void;
  onDragEnd: () => void;
  onDragOverRoot: (slot: Slot, event: DragEvent<HTMLDivElement>) => void;
  onDragLeaveRoot: (slot: Slot, event: DragEvent<HTMLDivElement>) => void;
  onDropToRoot: (
    slot: Slot,
    event: DragEvent<HTMLDivElement>,
    bookId: string | number | null,
    setError: (value: string | null) => void,
  ) => void;
  onDragOverNode: (
    slot: Slot,
    nodeId: string | number,
    event: DragEvent<HTMLDivElement>,
  ) => void;
  onDragLeaveNode: (slot: Slot, nodeId: string | number) => void;
  onDropOnNode: (
    slot: Slot,
    nodeId: string | number | null,
    event: DragEvent<HTMLDivElement>,
    bookId: string | number | null,
    setError: (value: string | null) => void,
  ) => void;
  setNodesError: (value: string | null) => void;
  problemsByNode: Record<string, Problem[]>;
  problemsLoadingByNode: Record<string, boolean>;
  problemsErrorByNode: Record<string, string | null>;
  openProblemNodes: Record<string, boolean>;
  showAllProblems: Record<string, boolean>;
  getProblemsKey: (slot: Slot, nodeId: string | number) => string;
  getProblemKey: (problem: Problem, index: number) => string;
  toggleProblemsForNode: (slot: Slot, nodeId: string | number) => void;
  toggleShowAll: (slot: Slot, nodeId: string | number) => void;
};

export const TreeCanvas = ({
  slot,
  bookId,
  bookTitle,
  nodes,
  nodesLoading,
  nodesError,
  selectedNodeId,
  setSelectedNodeId,
  onRefreshNodes,
  onCreateChapter,
  nodeWidth,
  nodeHeight,
  getExpandedHeight,
  chapterPopover,
  setChapterPopover,
  inlineChapter,
  setInlineChapter,
  draggingNode,
  dragOverNode,
  rootDragActive,
  onDragStartNode,
  onDragEnd,
  onDragOverRoot,
  onDragLeaveRoot,
  onDropToRoot,
  onDragOverNode,
  onDragLeaveNode,
  onDropOnNode,
  setNodesError,
  problemsByNode,
  problemsLoadingByNode,
  problemsErrorByNode,
  openProblemNodes,
  showAllProblems,
  getProblemsKey,
  getProblemKey,
  toggleProblemsForNode,
  toggleShowAll,
}: TreeCanvasProps) => {
  const isChapterPopoverOpen = chapterPopover?.slot === slot;
  const chapterTitle = isChapterPopoverOpen ? chapterPopover?.title ?? "" : "";
  const isInlineChapterOpen = inlineChapter?.slot === slot;
  const { viewport, setViewport, onMouseDown, onWheel } = usePanZoom();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const layout: GraphLayout = useMemo(
    () =>
      buildGraphLayout(nodes, {
        nodeWidth,
        nodeHeight,
        getNodeHeight: (node) =>
          node.id !== undefined && node.id !== null
            ? nodeHeight + getExpandedHeight(slot, node.id)
            : nodeHeight,
      }),
    [getExpandedHeight, nodeHeight, nodeWidth, nodes, slot],
  );

  useEffect(() => {
    setViewport({ x: 0, y: 0, scale: 1 });
  }, [bookId, setViewport]);

  useEffect(() => {
    if (chapterPopover?.slot === slot) {
      setChapterPopover(null);
    }
    if (inlineChapter?.slot === slot) {
      setInlineChapter(null);
    }
  }, [bookId, chapterPopover, inlineChapter, setChapterPopover, setInlineChapter, slot]);

  const handleCreateChapter = useCallback(async () => {
    const created = await onCreateChapter(slot, chapterTitle);
    if (created) {
      setChapterPopover(null);
      setInlineChapter(null);
    }
  }, [chapterTitle, onCreateChapter, slot]);

  const handleInlineCreate = useCallback(async () => {
    if (!inlineChapter || inlineChapter.slot !== slot) {
      return;
    }
    const created = await onCreateChapter(slot, inlineChapter.title);
    if (created) {
      setInlineChapter(null);
    }
  }, [inlineChapter, onCreateChapter, slot]);

  const handleCanvasDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!bookId) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-node-card='true']")) {
        return;
      }
      const container = canvasRef.current;
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
    [bookId, setChapterPopover, setInlineChapter, slot],
  );

  const treeTitle = slot === "primary" ? "Primary tree" : "Secondary tree";

  const emptyState = useMemo(() => {
    if (bookId === null) {
      return "Select a book to view nodes.";
    }
    if (nodesLoading && nodes.length === 0) {
      return "Loading nodes...";
    }
    if (nodes.length === 0) {
      return "No nodes yet.";
    }
    return null;
  }, [bookId, nodes, nodesLoading]);

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{treeTitle}</h3>
          <p className="text-xs text-zinc-500">
            {bookTitle ?? "Select a book"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm disabled:cursor-not-allowed disabled:border-neutral-100 disabled:text-neutral-300"
              type="button"
              onClick={() => {
                setChapterPopover({ slot, title: "" });
                setInlineChapter(null);
              }}
              disabled={!bookId}
            >
              + Chapter
            </button>
            {isChapterPopoverOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
                <input
                  className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-xs"
                  placeholder="Chapter title"
                  value={chapterTitle}
                  onChange={(event) =>
                    setChapterPopover({ slot, title: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleCreateChapter();
                    }
                    if (event.key === "Escape") {
                      setChapterPopover(null);
                    }
                  }}
                />
                <button
                  className="mt-2 w-full rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                  type="button"
                  onClick={() => void handleCreateChapter()}
                  disabled={!chapterTitle.trim()}
                >
                  Create
                </button>
              </div>
            ) : null}
          </div>
          {bookId ? (
            <button
              className="text-xs text-zinc-500 underline"
              type="button"
              onClick={onRefreshNodes}
            >
              Refresh nodes
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={canvasRef}
        className="relative h-[420px] overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 text-sm"
        onDragOver={(event) => onDragOverRoot(slot, event)}
        onDragLeave={(event) => onDragLeaveRoot(slot, event)}
        onDrop={(event) => onDropToRoot(slot, event, bookId, setNodesError)}
        onDoubleClick={handleCanvasDoubleClick}
      >
        {rootDragActive === slot ? (
          <div className="pointer-events-none absolute inset-0 z-10 rounded-xl bg-indigo-100/60" />
        ) : null}
        {emptyState ? (
          <div className="flex h-full items-center justify-center text-zinc-500">
            {emptyState}
          </div>
        ) : (
          <div className="absolute inset-0" onMouseDown={onMouseDown} onWheel={onWheel}>
            <div
              className="absolute inset-0"
              style={{
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                transformOrigin: "0 0",
              }}
            >
              <svg
                className="absolute left-0 top-0"
                width={layout.width}
                height={layout.height}
              >
                {layout.edges.map((edge) => {
                  const startX = edge.from.x + nodeWidth / 2;
                  const startY = edge.from.y + edge.from.height;
                  const endX = edge.to.x + nodeWidth / 2;
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
              {layout.nodes.map((graphNode) => {
                const isSelected =
                  selectedNodeId !== null &&
                  String(selectedNodeId) === graphNode.id;
                const isDragging =
                  draggingNode?.slot === slot &&
                  String(draggingNode.nodeId) === graphNode.id;
                const isDropTarget =
                  dragOverNode?.slot === slot &&
                  String(dragOverNode.nodeId) === graphNode.id;
                const nodeId = graphNode.node.id;
                const canManageProblems = nodeId !== undefined && nodeId !== null;
                const problemsKey = canManageProblems
                  ? getProblemsKey(slot, nodeId)
                  : null;
                const isOpen = problemsKey
                  ? openProblemNodes[problemsKey] ?? false
                  : false;
                const problemsForNode = problemsKey
                  ? problemsByNode[problemsKey] ?? []
                  : [];
                const isLoading = problemsKey
                  ? problemsLoadingByNode[problemsKey] ?? false
                  : false;
                const error = problemsKey
                  ? problemsErrorByNode[problemsKey] ?? null
                  : null;
                const showAll = problemsKey
                  ? showAllProblems[problemsKey] ?? false
                  : false;
                const visibleProblems = showAll
                  ? problemsForNode
                  : problemsForNode.slice(0, 10);

                return (
                  <div key={graphNode.id}>
                    <div
                      data-node-card="true"
                      role="button"
                      tabIndex={0}
                      className={`absolute rounded-xl border px-4 py-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-neutral-400 ${
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white text-zinc-900 hover:bg-neutral-50"
                      } ${
                        isDragging ? "scale-[1.02] shadow-lg" : "hover:shadow-md"
                      } ${
                        isDropTarget && !isSelected
                          ? "ring-2 ring-indigo-300 bg-indigo-50"
                          : ""
                      }`}
                      style={{
                        left: graphNode.x,
                        top: graphNode.y,
                        width: nodeWidth,
                        height: graphNode.height,
                      }}
                      draggable={Boolean(graphNode.node.id && bookId)}
                      onDragStart={(event) => {
                        if (!graphNode.node.id || !bookId) {
                          return;
                        }
                        onDragStartNode(slot, graphNode.node.id, bookId, event);
                      }}
                      onDragEnd={onDragEnd}
                      onClick={() => {
                        if (
                          graphNode.node.id !== undefined &&
                          graphNode.node.id !== null
                        ) {
                          setSelectedNodeId(graphNode.node.id);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          if (
                            graphNode.node.id !== undefined &&
                            graphNode.node.id !== null
                          ) {
                            setSelectedNodeId(graphNode.node.id);
                          }
                        }
                      }}
                      onDragOver={(event) => {
                        if (
                          graphNode.node.id === null ||
                          graphNode.node.id === undefined
                        ) {
                          return;
                        }
                        onDragOverNode(slot, graphNode.node.id, event);
                      }}
                      onDragLeave={() => {
                        if (
                          graphNode.node.id !== undefined &&
                          graphNode.node.id !== null
                        ) {
                          onDragLeaveNode(slot, graphNode.node.id);
                        }
                      }}
                      onDrop={(event) => {
                        onDropOnNode(
                          slot,
                          graphNode.node.id ?? null,
                          event,
                          bookId,
                          setNodesError,
                        );
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">
                            {graphNode.node.title}
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            id: {graphNode.node.id ?? "-"}
                          </div>
                        </div>
                        <button
                          className="rounded-full border border-neutral-200 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            if (canManageProblems) {
                              toggleProblemsForNode(slot, nodeId as string | number);
                            }
                          }}
                          disabled={!canManageProblems}
                        >
                          {isOpen ? "▾ Problems" : "▸ Problems"}
                        </button>
                      </div>
                      {isOpen && problemsKey ? (
                        <div
                          className="mt-2 border-t border-neutral-200 bg-white/95 pt-2 text-xs text-zinc-700"
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-zinc-700">
                              Problems
                            </span>
                            {nodeId ? (
                              <Link
                                className="text-[11px] font-semibold text-neutral-700 underline"
                                href={`/nodes/${nodeId}/problems/new`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                + Add problem
                              </Link>
                            ) : null}
                          </div>
                          {isLoading ? (
                            <p className="mt-2 text-zinc-500">Loading...</p>
                          ) : error ? (
                            <p className="mt-2 text-red-600">
                              Failed to load problems
                            </p>
                          ) : problemsForNode.length === 0 ? (
                            <p className="mt-2 text-zinc-500">No problems yet.</p>
                          ) : (
                            <ul className="mt-2 space-y-1">
                              {visibleProblems.map((problem, index) => {
                                const problemKey = getProblemKey(problem, index);
                                const problemHref =
                                  problem.id !== undefined && problem.id !== null
                                    ? `/problems/${problem.id}`
                                    : null;
                                return (
                                  <li
                                    key={problemKey}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-1"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-[11px] font-semibold text-zinc-800">
                                        {problem.content?.title ??
                                          "Untitled problem"}
                                      </p>
                                      <p className="text-[10px] text-zinc-500">
                                        id: {problem.id ?? "-"}
                                      </p>
                                    </div>
                                    {problemHref ? (
                                      <Link
                                        className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 hover:bg-white"
                                        href={problemHref}
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                      >
                                        Open
                                      </Link>
                                    ) : (
                                      <span className="text-[10px] text-zinc-400">
                                        No ID
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {problemsForNode.length > 10 ? (
                            <button
                              className="mt-2 text-[11px] font-semibold text-neutral-600 underline"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleShowAll(slot, nodeId as string | number);
                              }}
                            >
                              {showAll ? "Show less" : "Show all"}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {isInlineChapterOpen && inlineChapter ? (
                <div
                  className="absolute z-20"
                  style={{ left: inlineChapter.x, top: inlineChapter.y }}
                >
                  <input
                    className="w-52 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs shadow-lg"
                    placeholder="New chapter"
                    autoFocus
                    value={inlineChapter.title}
                    onChange={(event) =>
                      setInlineChapter({
                        slot,
                        x: inlineChapter.x,
                        y: inlineChapter.y,
                        title: event.target.value,
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void handleInlineCreate();
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
      {nodesError ? <p className="text-xs text-red-600">{nodesError}</p> : null}
    </section>
  );
};
