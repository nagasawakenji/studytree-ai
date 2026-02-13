import { useCallback, useState, type DragEvent } from "react";

import { moveSubtree } from "@/lib/api";
import type { DragPayload, Slot } from "@/app/_types";

type UseNodeDndParams = {
  primaryBookId: string | number | null;
  secondaryBookId: string | number | null;
  primarySelectedNodeId: string | number | null;
  secondarySelectedNodeId: string | number | null;
  setPrimarySelectedNodeId: (value: string | number | null) => void;
  setSecondarySelectedNodeId: (value: string | number | null) => void;
  refreshBookNodes: (bookId: string | number) => Promise<void>;
};

type DragState = {
  slot: Slot;
  nodeId: string | number;
} | null;

export const useNodeDnd = (params: UseNodeDndParams) => {
  const {
    primaryBookId,
    secondaryBookId,
    primarySelectedNodeId,
    secondarySelectedNodeId,
    setPrimarySelectedNodeId,
    setSecondarySelectedNodeId,
    refreshBookNodes,
  } = params;

  const [draggingNode, setDraggingNode] = useState<DragState>(null);
  const [dragOverNode, setDragOverNode] = useState<DragState>(null);
  const [rootDragActive, setRootDragActive] = useState<Slot | null>(null);

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
      setPrimarySelectedNodeId,
      setSecondarySelectedNodeId,
    ],
  );

  const onDragStartNode = useCallback(
    (
      slot: Slot,
      nodeId: string | number,
      bookId: string | number | null,
      event: DragEvent<HTMLElement>,
    ) => {
      if (!bookId) {
        return;
      }
      setDraggingNode({ slot, nodeId });
      event.dataTransfer.setData(
        "application/json",
        JSON.stringify({ nodeId, bookId }),
      );
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const onDragEnd = useCallback(() => {
    setDraggingNode(null);
    setDragOverNode(null);
    setRootDragActive(null);
  }, []);

  const onDragOverRoot = useCallback((slot: Slot, event: DragEvent) => {
    event.preventDefault();
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-node-card='true']")) {
      if (rootDragActive === slot) {
        setRootDragActive(null);
      }
      return;
    }
    setRootDragActive(slot);
  }, [rootDragActive]);

  const onDragLeaveRoot = useCallback((slot: Slot, event: DragEvent) => {
    if (event.currentTarget === event.target) {
      if (rootDragActive === slot) {
        setRootDragActive(null);
      }
    }
  }, [rootDragActive]);

  const onDropToRoot = useCallback(
    (
      slot: Slot,
      event: DragEvent<HTMLDivElement>,
      dstBookId: string | number | null,
      setError: (value: string | null) => void,
    ) => {
      const target = event.target as HTMLElement | null;
      if (rootDragActive === slot) {
        setRootDragActive(null);
      }
      if (target?.closest("[data-node-card='true']")) {
        return;
      }
      handleDropNode(event, dstBookId, null, setError);
    },
    [handleDropNode, rootDragActive],
  );

  const onDragOverNode = useCallback(
    (slot: Slot, nodeId: string | number, event: DragEvent) => {
      event.preventDefault();
      if (rootDragActive === slot) {
        setRootDragActive(null);
      }
      setDragOverNode({ slot, nodeId });
    },
    [rootDragActive],
  );

  const onDragLeaveNode = useCallback(
    (slot: Slot, nodeId: string | number) => {
      setDragOverNode((prev) =>
        prev?.slot === slot && String(prev.nodeId) === String(nodeId)
          ? null
          : prev,
      );
    },
    [],
  );

  const onDropOnNode = useCallback(
    (
      slot: Slot,
      nodeId: string | number | null,
      event: DragEvent<HTMLDivElement>,
      dstBookId: string | number | null,
      setError: (value: string | null) => void,
    ) => {
      setDragOverNode(null);
      if (rootDragActive === slot) {
        setRootDragActive(null);
      }
      handleDropNode(event, dstBookId, nodeId, setError);
    },
    [handleDropNode, rootDragActive],
  );

  return {
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
  };
};
