import type { BookNode } from "./api";

export type GraphNode = {
  id: string;
  node: BookNode;
  x: number;
  y: number;
  depth: number;
  height: number;
};

export type GraphEdge = {
  from: GraphNode;
  to: GraphNode;
};

export type GraphLayout = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
};

const DEFAULT_OPTIONS = {
  nodeWidth: 200,
  nodeHeight: 72,
  xGap: 56,
  yGap: 72,
  padding: 24,
};

type LayoutOptions = Partial<typeof DEFAULT_OPTIONS>;
type LayoutOptionsWithHeight = LayoutOptions & {
  getNodeHeight?: (node: BookNode) => number;
};

export const buildGraphLayout = (
  nodes: BookNode[],
  options: LayoutOptionsWithHeight = {},
): GraphLayout => {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const getNodeHeight =
    options.getNodeHeight ?? (() => settings.nodeHeight);
  const idMap = new Map<string, BookNode>();
  const childrenMap = new Map<string, BookNode[]>();

  nodes.forEach((node) => {
    if (node.id === null || node.id === undefined) {
      return;
    }
    idMap.set(String(node.id), node);
  });

  const sortedNodes = [...idMap.values()].sort((a, b) => {
    const orderA = Number(a.order_index ?? 0);
    const orderB = Number(b.order_index ?? 0);
    return orderA - orderB;
  });

  sortedNodes.forEach((node) => {
    const parentId =
      node.parent_id !== null && node.parent_id !== undefined
        ? String(node.parent_id)
        : null;
    if (parentId && idMap.has(parentId)) {
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)?.push(node);
    }
  });

  const roots = sortedNodes.filter((node) => {
    if (node.parent_id === null || node.parent_id === undefined) {
      return true;
    }
    return !idMap.has(String(node.parent_id));
  });

  let leafIndex = 0;
  const xMap = new Map<string, number>();
  const positionedNodes: GraphNode[] = [];

  const assignX = (node: BookNode): number => {
    const nodeId = String(node.id);
    if (xMap.has(nodeId)) {
      return xMap.get(nodeId) ?? 0;
    }
    const children = childrenMap.get(nodeId) ?? [];
    if (children.length === 0) {
      const x = leafIndex;
      leafIndex += 1;
      xMap.set(nodeId, x);
      return x;
    }
    const childXs = children.map(assignX);
    const min = Math.min(...childXs);
    const max = Math.max(...childXs);
    const x = (min + max) / 2;
    xMap.set(nodeId, x);
    return x;
  };

  roots.forEach(assignX);

  const depthMap = new Map<string, number>();
  const depthMaxHeights: number[] = [];

  const assignDepths = (node: BookNode, depth: number) => {
    const nodeId = String(node.id);
    depthMap.set(nodeId, depth);
    const height = getNodeHeight(node);
    depthMaxHeights[depth] = Math.max(depthMaxHeights[depth] ?? 0, height);
    const children = childrenMap.get(nodeId) ?? [];
    children.forEach((child) => assignDepths(child, depth + 1));
  };

  roots.forEach((root) => assignDepths(root, 0));

  const depthOffsets: number[] = [];
  let currentY = settings.padding;
  for (let depth = 0; depth < depthMaxHeights.length; depth += 1) {
    depthOffsets[depth] = currentY;
    currentY += (depthMaxHeights[depth] ?? settings.nodeHeight) + settings.yGap;
  }

  const positionNodes = (node: BookNode, depth: number) => {
    const nodeId = String(node.id);
    const xIndex = xMap.get(nodeId) ?? 0;
    const x =
      settings.padding + xIndex * (settings.nodeWidth + settings.xGap);
    const y = depthOffsets[depth] ?? settings.padding;
    const height = getNodeHeight(node);
    const graphNode: GraphNode = {
      id: nodeId,
      node,
      x,
      y,
      depth,
      height,
    };
    positionedNodes.push(graphNode);

    const children = childrenMap.get(nodeId) ?? [];
    children.forEach((child) => positionNodes(child, depth + 1));
  };

  roots.forEach((root) => positionNodes(root, 0));

  const graphNodeMap = new Map<string, GraphNode>(
    positionedNodes.map((graphNode) => [graphNode.id, graphNode]),
  );

  const edges: GraphEdge[] = [];
  positionedNodes.forEach((graphNode) => {
    const parentId =
      graphNode.node.parent_id !== null &&
      graphNode.node.parent_id !== undefined
        ? String(graphNode.node.parent_id)
        : null;
    if (parentId && graphNodeMap.has(parentId)) {
      edges.push({
        from: graphNodeMap.get(parentId)!,
        to: graphNode,
      });
    }
  });

  const maxX = positionedNodes.reduce((acc, node) => Math.max(acc, node.x), 0);
  const maxY = positionedNodes.reduce(
    (acc, node) => Math.max(acc, node.y + node.height),
    0,
  );

  const width = maxX + settings.nodeWidth + settings.padding;
  const height = maxY + settings.padding;

  return { nodes: positionedNodes, edges, width, height };
};
