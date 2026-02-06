"use client";

import { useEffect, useState } from "react";

import { BooksSidebar } from "./_components/BooksSidebar";
import { TreeCanvas } from "./_components/TreeCanvas";
import { useBooks } from "./_hooks/useBooks";
import { useBookNodes } from "./_hooks/useBookNodes";
import { useNodeDnd } from "./_hooks/useNodeDnd";
import { useNodeProblems } from "./_hooks/useNodeProblems";
import type { ChapterPopoverState, InlineChapterState, Slot } from "./_types";

const GRAPH_NODE_WIDTH = 200;
const GRAPH_NODE_HEIGHT = 72;

const getBookTitle = (
  books: { id?: string | number; title: string }[],
  bookId: string | number | null,
): string | null => {
  if (bookId === null) {
    return null;
  }
  return books.find((book) => String(book.id) === String(bookId))?.title ?? null;
};

export default function Home() {
  const [chapterPopover, setChapterPopover] =
    useState<ChapterPopoverState | null>(null);
  const [inlineChapter, setInlineChapter] =
    useState<InlineChapterState | null>(null);

  const { books, booksLoading, booksError, loadBooks, createBook } = useBooks();
  const nodeProblems = useNodeProblems();
  const {
    problemsByNode,
    problemsLoadingByNode,
    problemsErrorByNode,
    openProblemNodes,
    showAllProblems,
    getProblemsKey,
    getProblemKey,
    getExpandedHeight,
    toggleProblemsForNode,
    toggleShowAll,
    clearProblemsCacheForSlot,
  } = nodeProblems;
  const bookNodes = useBookNodes({ onClearSlot: clearProblemsCacheForSlot });
  const {
    primaryBookId,
    secondaryBookId,
    setPrimaryBookId,
    setSecondaryBookId,
  } = bookNodes;
  const {
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
  } = useNodeDnd({
    primaryBookId,
    secondaryBookId,
    primarySelectedNodeId: bookNodes.primarySelectedNodeId,
    secondarySelectedNodeId: bookNodes.secondarySelectedNodeId,
    setPrimarySelectedNodeId: bookNodes.setPrimarySelectedNodeId,
    setSecondarySelectedNodeId: bookNodes.setSecondarySelectedNodeId,
    refreshBookNodes: bookNodes.refreshBookNodes,
  });

  const primaryBookTitle = getBookTitle(books, primaryBookId);
  const secondaryBookTitle = getBookTitle(books, secondaryBookId);

  const handleCreateChapter = async (slot: Slot, title: string) => {
    const created = await bookNodes.createChapter(slot, title);
    if (created) {
      setChapterPopover((prev) => (prev?.slot === slot ? null : prev));
      setInlineChapter((prev) => (prev?.slot === slot ? null : prev));
    }
    return created;
  };

  useEffect(() => {
    setChapterPopover((prev) => (prev?.slot === "primary" ? null : prev));
    setInlineChapter((prev) => (prev?.slot === "primary" ? null : prev));
  }, [primaryBookId]);

  useEffect(() => {
    setChapterPopover((prev) => (prev?.slot === "secondary" ? null : prev));
    setInlineChapter((prev) => (prev?.slot === "secondary" ? null : prev));
  }, [secondaryBookId]);

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <BooksSidebar
        books={books}
        booksLoading={booksLoading}
        booksError={booksError}
        primaryBookId={primaryBookId}
        secondaryBookId={secondaryBookId}
        onSelectPrimary={setPrimaryBookId}
        onSelectSecondary={setSecondaryBookId}
        onRefreshBooks={() => void loadBooks()}
        onCreateBook={createBook}
      />

      <main className="flex-1 bg-neutral-50 p-8 text-zinc-900">
        <div className="mx-auto flex h-full max-w-6xl flex-col gap-6">
          <header className="space-y-1">
            <h2 className="text-2xl font-semibold">Dual Book Trees</h2>
            <p className="text-sm text-zinc-500">
              Drag a node across books to reparent. Use the Problems toggle on
              each node to view its inline list.
            </p>
          </header>

          <div
            className={`grid gap-6 ${
              secondaryBookId ? "lg:grid-cols-2" : "lg:grid-cols-1"
            }`}
          >
            <TreeCanvas
              slot="primary"
              bookId={primaryBookId}
              bookTitle={primaryBookTitle}
              nodes={bookNodes.primaryNodes}
              nodesLoading={bookNodes.primaryNodesLoading}
              nodesError={bookNodes.primaryNodesError}
              selectedNodeId={bookNodes.primarySelectedNodeId}
              setSelectedNodeId={bookNodes.setPrimarySelectedNodeId}
              onRefreshNodes={() =>
                primaryBookId &&
                void bookNodes.loadNodes(primaryBookId, "primary")
              }
              onCreateChapter={handleCreateChapter}
              nodeWidth={GRAPH_NODE_WIDTH}
              nodeHeight={GRAPH_NODE_HEIGHT}
              getExpandedHeight={getExpandedHeight}
              chapterPopover={chapterPopover}
              setChapterPopover={setChapterPopover}
              inlineChapter={inlineChapter}
              setInlineChapter={setInlineChapter}
              draggingNode={draggingNode}
              dragOverNode={dragOverNode}
              rootDragActive={rootDragActive}
              onDragStartNode={onDragStartNode}
              onDragEnd={onDragEnd}
              onDragOverRoot={onDragOverRoot}
              onDragLeaveRoot={onDragLeaveRoot}
              onDropToRoot={onDropToRoot}
              onDragOverNode={onDragOverNode}
              onDragLeaveNode={onDragLeaveNode}
              onDropOnNode={onDropOnNode}
              setNodesError={bookNodes.setPrimaryNodesError}
              problemsByNode={problemsByNode}
              problemsLoadingByNode={problemsLoadingByNode}
              problemsErrorByNode={problemsErrorByNode}
              openProblemNodes={openProblemNodes}
              showAllProblems={showAllProblems}
              getProblemsKey={getProblemsKey}
              getProblemKey={getProblemKey}
              toggleProblemsForNode={toggleProblemsForNode}
              toggleShowAll={toggleShowAll}
            />

            {secondaryBookId ? (
              <TreeCanvas
                slot="secondary"
                bookId={secondaryBookId}
                bookTitle={secondaryBookTitle}
                nodes={bookNodes.secondaryNodes}
                nodesLoading={bookNodes.secondaryNodesLoading}
                nodesError={bookNodes.secondaryNodesError}
                selectedNodeId={bookNodes.secondarySelectedNodeId}
                setSelectedNodeId={bookNodes.setSecondarySelectedNodeId}
                onRefreshNodes={() =>
                  secondaryBookId &&
                  void bookNodes.loadNodes(secondaryBookId, "secondary")
                }
                onCreateChapter={handleCreateChapter}
                nodeWidth={GRAPH_NODE_WIDTH}
                nodeHeight={GRAPH_NODE_HEIGHT}
                getExpandedHeight={getExpandedHeight}
                chapterPopover={chapterPopover}
                setChapterPopover={setChapterPopover}
                inlineChapter={inlineChapter}
                setInlineChapter={setInlineChapter}
                draggingNode={draggingNode}
                dragOverNode={dragOverNode}
                rootDragActive={rootDragActive}
                onDragStartNode={onDragStartNode}
                onDragEnd={onDragEnd}
                onDragOverRoot={onDragOverRoot}
                onDragLeaveRoot={onDragLeaveRoot}
                onDropToRoot={onDropToRoot}
                onDragOverNode={onDragOverNode}
                onDragLeaveNode={onDragLeaveNode}
                onDropOnNode={onDropOnNode}
                setNodesError={bookNodes.setSecondaryNodesError}
                problemsByNode={problemsByNode}
                problemsLoadingByNode={problemsLoadingByNode}
                problemsErrorByNode={problemsErrorByNode}
                openProblemNodes={openProblemNodes}
                showAllProblems={showAllProblems}
                getProblemsKey={getProblemsKey}
                getProblemKey={getProblemKey}
                toggleProblemsForNode={toggleProblemsForNode}
                toggleShowAll={toggleShowAll}
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
