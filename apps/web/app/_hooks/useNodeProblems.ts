import { useCallback, useState } from "react";

import { listProblems, type Problem } from "@/lib/api";
import type { Slot } from "@/app/_types";

const PROBLEMS_HEADER_HEIGHT = 28;
const PROBLEM_ROW_HEIGHT = 32;
const PROBLEMS_FOOTER_HEIGHT = 20;

export const useNodeProblems = () => {
  const [problemsByNode, setProblemsByNode] = useState<
    Record<string, Problem[]>
  >({});
  const [problemsLoadingByNode, setProblemsLoadingByNode] = useState<
    Record<string, boolean>
  >({});
  const [problemsErrorByNode, setProblemsErrorByNode] = useState<
    Record<string, string | null>
  >({});
  const [openProblemNodes, setOpenProblemNodes] = useState<
    Record<string, boolean>
  >({});
  const [showAllProblems, setShowAllProblems] = useState<
    Record<string, boolean>
  >({});

  const getProblemsKey = useCallback((slot: Slot, nodeId: string | number) => {
    return `${slot}:${nodeId}`;
  }, []);

  const clearProblemsCacheForSlot = useCallback((slot: Slot) => {
    const prefix = `${slot}:`;
    const filterBySlot = <T extends Record<string, unknown>>(value: T): T => {
      const nextEntries = Object.entries(value).filter(
        ([key]) => !key.startsWith(prefix),
      );
      return Object.fromEntries(nextEntries) as T;
    };
    setProblemsByNode((prev) => filterBySlot(prev));
    setProblemsLoadingByNode((prev) => filterBySlot(prev));
    setProblemsErrorByNode((prev) => filterBySlot(prev));
    setOpenProblemNodes((prev) => filterBySlot(prev));
    setShowAllProblems((prev) => filterBySlot(prev));
  }, []);

  const loadProblemsForNode = useCallback(
    async (slot: Slot, nodeId: string | number) => {
      const key = getProblemsKey(slot, nodeId);
      setProblemsErrorByNode((prev) => ({ ...prev, [key]: null }));
      setProblemsLoadingByNode((prev) => ({ ...prev, [key]: true }));
      try {
        const data = await listProblems(nodeId);
        setProblemsByNode((prev) => ({ ...prev, [key]: data }));
        return data;
      } catch (err) {
        setProblemsErrorByNode((prev) => ({
          ...prev,
          [key]: err instanceof Error ? err.message : "Failed to load problems",
        }));
        return [];
      } finally {
        setProblemsLoadingByNode((prev) => ({ ...prev, [key]: false }));
      }
    },
    [getProblemsKey],
  );

  const toggleProblemsForNode = useCallback(
    (slot: Slot, nodeId: string | number) => {
      const key = getProblemsKey(slot, nodeId);
      setOpenProblemNodes((prev) => {
        const nextOpen = !prev[key];
        if (
          nextOpen &&
          problemsByNode[key] === undefined &&
          !problemsLoadingByNode[key]
        ) {
          void loadProblemsForNode(slot, nodeId);
        }
        return { ...prev, [key]: nextOpen };
      });
    },
    [getProblemsKey, loadProblemsForNode, problemsByNode, problemsLoadingByNode],
  );

  const toggleShowAll = useCallback(
    (slot: Slot, nodeId: string | number) => {
      const key = getProblemsKey(slot, nodeId);
      setShowAllProblems((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [getProblemsKey],
  );

  const getExpandedHeight = useCallback(
    (slot: Slot, nodeId: string | number) => {
      const key = getProblemsKey(slot, nodeId);
      if (!openProblemNodes[key]) {
        return 0;
      }
      const problems = problemsByNode[key] ?? [];
      const isLoading = problemsLoadingByNode[key] ?? false;
      const error = problemsErrorByNode[key] ?? null;
      const showAll = showAllProblems[key] ?? false;
      let visibleCount = showAll
        ? problems.length
        : Math.min(problems.length, 10);
      if (isLoading || error || problems.length === 0) {
        visibleCount = Math.max(visibleCount, 1);
      }
      const footer = problems.length > 10 ? PROBLEMS_FOOTER_HEIGHT : 0;
      return (
        PROBLEMS_HEADER_HEIGHT + PROBLEM_ROW_HEIGHT * visibleCount + footer
      );
    },
    [
      getProblemsKey,
      openProblemNodes,
      problemsByNode,
      problemsLoadingByNode,
      problemsErrorByNode,
      showAllProblems,
    ],
  );

  const getProblemKey = useCallback((problem: Problem, index: number) => {
    if (problem.id !== undefined && problem.id !== null) {
      return String(problem.id);
    }
    return `idx-${index}`;
  }, []);

  return {
    problemsByNode,
    problemsLoadingByNode,
    problemsErrorByNode,
    openProblemNodes,
    showAllProblems,
    getProblemsKey,
    getProblemKey,
    getExpandedHeight,
    loadProblemsForNode,
    toggleProblemsForNode,
    toggleShowAll,
    clearProblemsCacheForSlot,
  };
};
