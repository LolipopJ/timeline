import { mdiArrowDownThick } from "@mdi/js";
import Icon from "@mdi/react";
import { useEffect, useRef, useState } from "react";

export interface ExpandableContainerProps
  extends React.PropsWithChildren, React.HTMLAttributes<HTMLDivElement> {
  expandableHeightThresholdRatio: number;
}

export default function ExpandableContainer(props: ExpandableContainerProps) {
  const {
    children,
    expandableHeightThresholdRatio,
    className,
    style,
    ...rest
  } = props;
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const [expandable, setExpandable] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const showExpandButton = expandable && !expanded;

  useEffect(() => {
    const containerDom = containerRef.current;

    if (!expanded && !expandable && containerDom) {
      const expandableHeightThreshold =
        window.innerHeight * expandableHeightThresholdRatio;
      const domHeightObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const entryHeight = entry.contentRect.height;
          if (entryHeight > expandableHeightThreshold) {
            setExpandable(true);
            setMaxHeight(expandableHeightThreshold);
            domHeightObserver.unobserve(containerDom);
          }
        }
      });
      domHeightObserver.observe(containerDom);
      return () => domHeightObserver.unobserve(containerDom);
    }
  }, [expandable, expandableHeightThresholdRatio, expanded]);

  const onExpand = () => {
    containerRef.current?.focus({ preventScroll: true });
    setMaxHeight(undefined);
    setExpanded(true);
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={`${className} relative overflow-hidden`}
      style={{ ...style, maxHeight }}
      {...rest}
    >
      {children}
      {showExpandButton && (
        <button
          type="button"
          aria-label="展开全文"
          className="absolute inset-x-0 bottom-0 flex w-full cursor-pointer items-center justify-center bg-linear-to-b from-background-light/70 to-background-light py-2.5 text-foreground hover:text-primary focus-visible:-outline-offset-2"
          onClick={onExpand}
        >
          <Icon
            path={mdiArrowDownThick}
            className="size-5"
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
