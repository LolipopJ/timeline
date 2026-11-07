import { mdiChevronDown, mdiChevronUp } from "@mdi/js";
import Icon from "@mdi/react";
import { useEffect, useRef, useState } from "react";

export interface ExpandableContainerProps
  extends React.PropsWithChildren, React.HTMLAttributes<HTMLDivElement> {
  expandableHeightThresholdRatio: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export default function ExpandableContainer(props: ExpandableContainerProps) {
  const {
    children,
    expandableHeightThresholdRatio,
    expanded,
    onExpandedChange,
    className = "",
    style,
    ...rest
  } = props;
  const [collapsedHeight, setCollapsedHeight] = useState<number>();
  const [hasToggled, setHasToggled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || !Number.isFinite(expandableHeightThresholdRatio)) return;

    function measure() {
      if (!content) return;
      const limit = window.innerHeight * expandableHeightThresholdRatio;
      const height = content.getBoundingClientRect().height;
      setCollapsedHeight(height > limit ? limit : undefined);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(content);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [expandableHeightThresholdRatio]);

  function toggleExpanded() {
    const container = containerRef.current;
    if (!container) return;

    container.focus({ preventScroll: true });
    setHasToggled(true);
    onExpandedChange(!expanded);
    if (expanded && container.getBoundingClientRect().top < 0) {
      const reduceMotion = matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      container.scrollIntoView({
        block: "start",
        behavior: reduceMotion ? "instant" : "smooth",
      });
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={`${className} relative overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${hasToggled ? "motion-safe:transition-[height] motion-safe:duration-200 motion-safe:[interpolate-size:allow-keywords]" : ""}`}
      style={{
        ...style,
        height: expanded ? style?.height : (collapsedHeight ?? style?.height),
        // Keep the first virtual-row measurement at the collapsed height.
        maxHeight:
          !hasToggled &&
          !expanded &&
          Number.isFinite(expandableHeightThresholdRatio)
            ? `${expandableHeightThresholdRatio * 100}dvh`
            : style?.maxHeight,
      }}
      {...rest}
    >
      <div ref={contentRef}>{children}</div>
      {collapsedHeight !== undefined && (
        <button
          type="button"
          aria-label={expanded ? "收起全文" : "展开全文"}
          aria-expanded={expanded}
          onClick={toggleExpanded}
          className={`flex min-h-11 w-full cursor-pointer items-center justify-center bg-background-light text-foreground hover:text-primary focus-visible:-outline-offset-2 ${
            expanded
              ? ""
              : "absolute inset-x-0 bottom-0 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-16 before:bg-linear-to-b before:from-transparent before:to-background-light"
          }`}
        >
          <Icon
            path={expanded ? mdiChevronUp : mdiChevronDown}
            className="size-5"
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
