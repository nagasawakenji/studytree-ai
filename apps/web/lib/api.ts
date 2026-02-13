export type Book = {
  id?: string | number;
  title: string;
};

export type BookNode = {
  id?: string | number;
  title: string;
  parent_id?: string | number | null;
  order_index?: number | null;
};

export type ProblemContent = {
  title: string;
  body_md?: string;
  answer_md?: string;
  explanation_md?: string;
  stem_md?: string;
  body?: string;
  answer?: string;
  explanation?: string;
};

export type Problem = {
  id?: string | number;
  node_id?: string | number;
  kind?: string;
  schema_ver?: number;
  content?: ProblemContent;
  created_at?: string;
  updated_at?: string;
};

const API_PREFIX = "/api/v1";

function toInt64(value: string | number, fieldName: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${fieldName} must be an integer number`);
  }
  return n;
}

function toOptionalInt64(
  value: string | number | null | undefined,
  fieldName: string,
): number | null {
  if (value === undefined || value === null) return null;
  return toInt64(value, fieldName);
}

type BooksResponse = Book[] | { data?: Book[] };

async function parseBooksResponse(response: Response): Promise<Book[]> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const data = (await response.json()) as BooksResponse;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}

export async function listBooks(): Promise<Book[]> {
  const response = await fetch(`${API_PREFIX}/books`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return parseBooksResponse(response);
}

export async function createBook(title: string): Promise<Book> {
  const response = await fetch(`${API_PREFIX}/books`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as Book;
}

type NodesResponse = BookNode[] | { data?: BookNode[] };

async function parseNodesResponse(response: Response): Promise<BookNode[]> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const data = (await response.json()) as NodesResponse;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}

export async function listNodes(
  bookId: string | number,
  parentId?: string | number | null,
): Promise<BookNode[]> {
  const query =
    parentId === undefined
      ? ""
      : `?parent_id=${parentId === null ? "null" : parentId}`;
  const response = await fetch(`${API_PREFIX}/books/${bookId}/nodes${query}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return parseNodesResponse(response);
}

export async function listAllNodes(
  bookId: string | number,
): Promise<BookNode[]> {
  const allNodes: BookNode[] = [];
  const queue: Array<string | number> = [];

  const roots = await listNodes(bookId, null);
  allNodes.push(...roots);
  for (const node of roots) {
    if (node.id !== undefined && node.id !== null) {
      queue.push(node.id);
    }
  }

  while (queue.length > 0) {
    const parentId = queue.shift();
    if (parentId === undefined) {
      continue;
    }
    const children = await listNodes(bookId, parentId);
    allNodes.push(...children);
    for (const child of children) {
      if (child.id !== undefined && child.id !== null) {
        queue.push(child.id);
      }
    }
  }

  return allNodes;
}

export async function createNode(
  bookId: string | number,
  payload: Pick<BookNode, "title" | "parent_id" | "order_index">,
): Promise<BookNode> {
  const response = await fetch(`${API_PREFIX}/books/${bookId}/nodes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as BookNode;
}

type ProblemsResponse = { items?: Problem[] } | Problem[];

async function parseProblemsResponse(
  response: Response,
): Promise<Problem[]> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const data = (await response.json()) as ProblemsResponse;
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data.items)) {
    return data.items;
  }
  return [];
}

export async function listProblems(
  nodeId: string | number,
): Promise<Problem[]> {
  const response = await fetch(`${API_PREFIX}/nodes/${nodeId}/problems`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return parseProblemsResponse(response);
}

export async function createProblem(
  nodeId: string | number,
  payload: {
    kind?: string;
    title: string;
    body_md?: string;
    answer_md?: string;
    bodyMd?: string;
    answerMd?: string;
  },
): Promise<Problem> {
  const bodyMd = payload.body_md ?? payload.bodyMd ?? "";
  const answerMd = payload.answer_md ?? payload.answerMd ?? "";

  const response = await fetch(`${API_PREFIX}/nodes/${nodeId}/problems`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      kind: payload.kind ?? "qa",
      content: {
        title: payload.title,
        body_md: bodyMd,
        answer_md: answerMd,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as Problem;
}

export async function getProblem(
  problemId: string | number,
): Promise<Problem> {
  const response = await fetch(`${API_PREFIX}/problems/${problemId}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as Problem;
}

export async function moveSubtree(params: {
  srcBookId: string | number;
  nodeId: string | number;
  dstBookId: string | number;
  dstParentId?: string | number | null;
  dstOrderIndex?: number | null;
}): Promise<BookNode> {
  // URL path params can be strings; JSON body must be numbers/null to match Go int64 decoding.
  const srcBookIdStr = String(params.srcBookId);
  const nodeIdStr = String(params.nodeId);

  const dstBookId = toInt64(params.dstBookId, "dstBookId");
  const dstParentId = toOptionalInt64(params.dstParentId, "dstParentId");

  // Backend treats dst_order_index as required & non-negative; default to 0.
  const dstOrderIndex =
    params.dstOrderIndex === undefined || params.dstOrderIndex === null
      ? 0
      : params.dstOrderIndex;

  if (!Number.isFinite(dstOrderIndex) || dstOrderIndex < 0) {
    throw new Error("dstOrderIndex must be a non-negative number");
  }

  const response = await fetch(
    `${API_PREFIX}/books/${srcBookIdStr}/nodes/${nodeIdStr}/move`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        dst_book_id: dstBookId,
        dst_parent_id: dstParentId,
        dst_order_index: dstOrderIndex,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as BookNode;
}
