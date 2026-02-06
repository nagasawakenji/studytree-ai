import { useCallback, useEffect, useState } from "react";

import { createNode, listAllNodes, type BookNode } from "../../lib/api";
import type { Slot } from "../_types";

export const useBookNodes = (params?: {
  onClearSlot?: (slot: Slot) => void;
}) => {
  const { onClearSlot } = params ?? {};
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
  const [secondaryNodesError, setSecondaryNodesError] = useState<string | null>(
    null,
  );
  const [secondarySelectedNodeId, setSecondarySelectedNodeId] = useState<
    string | number | null
  >(null);

  const loadNodes = useCallback(
    async (bookId: string | number, slot: Slot) => {
      onClearSlot?.(slot);
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
        const message =
          err instanceof Error ? err.message : "Failed to load nodes";
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
    },
    [onClearSlot],
  );

  useEffect(() => {
    if (primaryBookId === null) {
      setPrimaryNodes([]);
      setPrimarySelectedNodeId(null);
      onClearSlot?.("primary");
      return;
    }

    void loadNodes(primaryBookId, "primary");
  }, [primaryBookId, loadNodes, onClearSlot]);

  useEffect(() => {
    if (secondaryBookId === null) {
      setSecondaryNodes([]);
      setSecondarySelectedNodeId(null);
      onClearSlot?.("secondary");
      return;
    }

    void loadNodes(secondaryBookId, "secondary");
  }, [secondaryBookId, loadNodes, onClearSlot]);

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

  const getRootCount = useCallback(
    (slot: Slot) => {
      const nodes = slot === "primary" ? primaryNodes : secondaryNodes;
      return nodes.filter(
        (node) => node.parent_id === null || node.parent_id === undefined,
      ).length;
    },
    [primaryNodes, secondaryNodes],
  );

  const createChapter = useCallback(
    async (slot: Slot, rawTitle: string) => {
      const titleValue = rawTitle.trim();
      const bookId = slot === "primary" ? primaryBookId : secondaryBookId;
      const setError =
        slot === "primary" ? setPrimaryNodesError : setSecondaryNodesError;

      if (!bookId || !titleValue) {
        return false;
      }

      setError(null);
      try {
        await createNode(bookId, {
          parent_id: null,
          order_index: getRootCount(slot),
          title: titleValue,
        });
        await refreshBookNodes(bookId);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create chapter");
        return false;
      }
    },
    [getRootCount, primaryBookId, refreshBookNodes, secondaryBookId],
  );

  return {
    primaryBookId,
    setPrimaryBookId,
    secondaryBookId,
    setSecondaryBookId,
    primaryNodes,
    primaryNodesLoading,
    primaryNodesError,
    primarySelectedNodeId,
    setPrimarySelectedNodeId,
    setPrimaryNodesError,
    secondaryNodes,
    secondaryNodesLoading,
    secondaryNodesError,
    secondarySelectedNodeId,
    setSecondarySelectedNodeId,
    setSecondaryNodesError,
    loadNodes,
    refreshBookNodes,
    createChapter,
  };
};
