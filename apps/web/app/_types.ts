export type Slot = "primary" | "secondary";

export type DragPayload = {
  nodeId?: string | number;
  bookId?: string | number;
};

export type Viewport = {
  x: number;
  y: number;
  scale: number;
};

export type InlineChapterState = {
  slot: Slot;
  x: number;
  y: number;
  title: string;
};

export type ChapterPopoverState = {
  slot: Slot;
  title: string;
};
