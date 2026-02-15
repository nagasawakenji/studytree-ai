import { useCallback, useRef, useState, type WheelEvent } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import type { Viewport } from "@/app/_types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const usePanZoom = () => {
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
    (event: ReactMouseEvent<HTMLDivElement>) => {
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
      const handleMove = (moveEvent: globalThis.MouseEvent) => {
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
