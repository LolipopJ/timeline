import type { ReactNode, RefObject } from "react";
import { useCallback, useRef } from "react";

export type RowHeight = {
  layoutKey: string;
  width: number;
  viewportHeight: number;
  height: number;
};

export default function VirtualRow({
  id,
  index,
  top,
  layoutKey,
  heightCache,
  measureElement,
  className,
  children,
}: {
  id: string;
  index: number;
  top: number;
  layoutKey: string;
  heightCache: RefObject<Map<string, RowHeight>>;
  measureElement: (element: HTMLDivElement | null) => void;
  className: string;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const attachRow = useCallback(
    (element: HTMLDivElement | null) => {
      const content = contentRef.current;
      if (!element || !content) return;

      const width = content.getBoundingClientRect().width;
      const viewportHeight = window.innerHeight;
      const cached = heightCache.current.get(id);
      let reservedHeight =
        cached?.layoutKey === layoutKey &&
        cached.width === width &&
        cached.viewportHeight === viewportHeight
          ? cached.height
          : 0;

      const updateHeight = () => {
        const bounds = content.getBoundingClientRect();
        const waitingForImages = Array.from(
          content.querySelectorAll("img"),
        ).some((image) => !image.complete);
        if (
          bounds.width !== width ||
          window.innerHeight !== viewportHeight ||
          bounds.height >= reservedHeight ||
          !waitingForImages
        ) {
          reservedHeight = 0;
        }
        element.style.minHeight = reservedHeight ? `${reservedHeight}px` : "";
        heightCache.current.set(id, {
          layoutKey,
          width: bounds.width,
          viewportHeight: window.innerHeight,
          height: Math.max(bounds.height, reservedHeight),
        });
      };

      // Reserve the previous size before the virtualizer measures unloaded media.
      updateHeight();
      measureElement(element);
      const observer = new ResizeObserver(updateHeight);
      observer.observe(content);
      element.addEventListener("load", updateHeight, true);
      element.addEventListener("error", updateHeight, true);
      window.addEventListener("resize", updateHeight);
      return () => {
        observer.disconnect();
        element.removeEventListener("load", updateHeight, true);
        element.removeEventListener("error", updateHeight, true);
        window.removeEventListener("resize", updateHeight);
        measureElement(null);
      };
    },
    [heightCache, id, layoutKey, measureElement],
  );

  return (
    <div
      ref={attachRow}
      data-index={index}
      data-timeline-row={id}
      className="absolute inset-x-0"
      style={{ top }}
    >
      <div ref={contentRef} className={`flow-root ${className}`}>
        {children}
      </div>
    </div>
  );
}
